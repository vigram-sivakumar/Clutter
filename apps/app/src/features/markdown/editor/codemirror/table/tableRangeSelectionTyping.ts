import { type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import type { TableActiveCellController } from './tableActiveCellController';
import { findCellWrapper } from './tableBoundaryNavigation';
import { endOfCellContent, findAllTables, resolveCellAt, startOfCellContent } from './tableGeometry';
import { tableSelectionChanged, tableSelectionField } from './tableSelection';

/**
 * Typing while a rectangular `range`-kind `TableSelection` is active
 * (`docs/table-range-selection-clipboard-ux-contract.md`'s "Typing"
 * section): the first character clears the range, reactivates the range's
 * own anchor cell with its caret restored to exactly where it was when the
 * drag began (`TableSelection.range.anchorCaretOffset` —
 * `tableCellRangeSelection.ts`'s own doc comment), then inserts the typed
 * character(s) there — never replacing the anchor's existing content.
 *
 * **Why this can't be a `keymap`, unlike every other table keyboard
 * interaction (`tableRangeSelectionKeyboard.ts`, `tableCellNavigation.ts`,
 * `tableBoundaryNavigation.ts`).** A CM6 `keymap` only resolves *bound key
 * combinations* — Tab, Enter, ArrowUp, and so on each have one well-known
 * `KeyboardEvent.key` value to bind against. Ordinary character typing has
 * no such fixed vocabulary: it must handle every printable Unicode
 * character, and in every real browser, CM6 itself doesn't build ordinary
 * text-insertion transactions from `keydown` at all — it reads the native
 * `beforeinput` event's own `data`, after (would-be) letting the browser's
 * default contenteditable insertion happen, then reconciles the resulting
 * DOM mutation. There is no `Command`/`KeyBinding` shape that "ordinary
 * typing" could bind to here.
 *
 * **The chosen interception point: `EditorView.domEventHandlers({beforeinput})`
 * on the root view, not a `transactionFilter`.** A `transactionFilter`
 * (`tableRootSelectionSnap.ts`, `tableActivationNormalization.ts`) can only
 * *rewrite the one transaction already being dispatched* — it cannot
 * redirect a keystroke into a *different* `EditorView` (the nested cell
 * editor's own, separate `contentDOM`), and dispatching a second,
 * independent transaction from inside a filter is unsafe (CM6 transaction
 * application is not reentrant). `beforeinput` is a genuinely different,
 * earlier point: it fires *before* the browser performs its native
 * contenteditable insertion at all, is cancelable
 * (`event.preventDefault()` — returning `true` from a `domEventHandlers`
 * handler calls this automatically, the same contract every other
 * `domEventHandlers` extension in this codebase already relies on, e.g.
 * `tokenMouseHandlers.ts`), and — critically — canceling it means the
 * browser never mutates the DOM at all, so CM6's own separate
 * `MutationObserver`-based change-reading (which is what actually produces
 * an ordinary typing transaction, *after* the native insertion already
 * happened) never has anything to observe. **Verified directly, not
 * assumed**: a `domEventHandlers({beforeinput: () => true})` extension
 * reliably intercepts a dispatched `beforeinput` event and leaves the
 * document unmodified — confirmed against the installed
 * `@codemirror/view@6.43.9` source and by direct test (this module's own
 * test file). CM6's own internal `beforeinput` handling (`handlers.beforeinput`
 * in the installed source) only performs bookkeeping during this event
 * (recording `event.data` for its own later use) — it does not itself call
 * `preventDefault()` for an ordinary `insertText`, so nothing about CM6's
 * own default path competes with ours calling it first.
 *
 * **Why letting the nested editor do the actual insertion satisfies "reuse
 * the normal CM6 input mechanism," even though the physical keystroke
 * landed on root's DOM.** Once the anchor cell is reactivated
 * (`controller.activate()` — the same method every other cell activation
 * in this codebase already goes through), this module dispatches one
 * ordinary `{changes: {from, to, insert}}` transaction directly on
 * `controller.nestedView` — structurally indistinguishable, from
 * `TableActiveCellController.forwardToRoot`'s own perspective (that
 * method's `EditorView.updateListener`, already installed on this same
 * reused nested view), from the user having typed that same character
 * directly into an already-active cell. The existing, already-tested
 * forward-to-root/undo/padding machinery handles the rest — this module
 * never constructs a root-level table-source transaction of its own, and
 * never reimplements `padCellContent`'s gap-reconstruction logic.
 *
 * **Composition (IME) input is explicitly out of scope and left alone.**
 * Only `event.inputType === 'insertText'` is handled; `insertCompositionText`
 * (and every other `beforeinput` type — deletion, formatting, paste) is
 * declined outright, falling through to CM6's/the browser's own default
 * handling exactly as today. Correctly intercepting a multi-keystroke IME
 * composition sequence mid-flight is a materially different problem this
 * milestone's own scope excludes; typing while a range selection is active
 * with an IME active is therefore not yet covered by this fix and keeps
 * today's (already broken, root-caret-position) behavior until a future
 * milestone addresses it deliberately.
 *
 * **One further known, narrow gap, worth naming rather than silently
 * accepting:** the installed CM6 source's own comment notes that
 * `beforeinput`'s `preventDefault()` "seems to do nothing at all on
 * Chrome" for one specific case — a Chrome-on-Android virtual-keyboard
 * workaround for faking `Backspace`/`Enter` key events, unrelated to
 * ordinary `insertText`. Clutter's own codebase is otherwise consistently
 * desktop/Tauri-WKWebView-focused (see this feature's own prior WKWebView-
 * specific fixes); this module has not been verified against Android
 * Chrome specifically, and that remains an open, narrow risk rather than
 * one this change resolves.
 */
export function tableRangeSelectionTyping(controller: TableActiveCellController): Extension {
  return EditorView.domEventHandlers({
    beforeinput(event, view) {
      if (event.inputType !== 'insertText' || !event.data) {
        return false;
      }
      const selection = view.state.field(tableSelectionField, false) ?? null;
      if (!selection || selection.kind !== 'range') {
        return false;
      }
      const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
      if (!table) {
        return false;
      }
      const { row: rowIndex, col: columnIndex } = selection.anchor;
      const cell = resolveCellAt(table.node, rowIndex, columnIndex);
      if (!cell) {
        return false;
      }
      const wrapper = findCellWrapper(view, table.from, rowIndex === 0 ? 'header' : 'body', rowIndex === 0 ? 0 : rowIndex - 1, columnIndex);
      if (!wrapper) {
        return false;
      }

      const from = startOfCellContent(view.state, cell.bounds);
      const to = endOfCellContent(view.state, cell.bounds);
      // Restores the anchor's own real caret — see
      // `TableSelection.range.anchorCaretOffset`'s own doc comment. Falls
      // back to content end (matching `tableRangeSelectionKeyboard.ts`'s
      // own Tab/Enter convention) only for a `TableSelection` constructed
      // without it, which no production code path currently produces.
      const cursorPos = selection.anchorCaretOffset !== undefined ? from + selection.anchorCaretOffset : to;

      // Clearing the selection and reactivating the anchor are both
      // effects-only dispatches (no `changes`) — neither enters undo
      // history on its own, the same "multiple small dispatches, one real
      // undo step" pattern already verified for Enter's own structural
      // insert in `tableRangeSelectionKeyboard.ts` (see that module's own
      // regression test and this module's own "no extra history step"
      // test).
      view.dispatch({ effects: [tableSelectionChanged.of(null)] });
      controller.activate(view, wrapper, from, to, cursorPos);

      const nestedView = controller.nestedView;
      if (!nestedView) {
        // The selection is already cleared above; nothing more to do —
        // defensive only, `controller.activate()` always establishes
        // `nestedView` when it returns.
        return true;
      }

      // The actual insertion — an ordinary nested-editor transaction,
      // indistinguishable from normal typing into an already-active cell
      // (this module's own top doc comment). Caret ends immediately after
      // the inserted text, per the UX contract.
      const caret = nestedView.state.selection.main.head;
      nestedView.dispatch({
        changes: { from: caret, to: caret, insert: event.data },
        selection: { anchor: caret + event.data.length },
      });
      return true;
    },
  });
}
