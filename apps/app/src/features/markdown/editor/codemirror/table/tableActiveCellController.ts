import { redo, undo } from '@codemirror/commands';
import { Annotation, StateEffect, type EditorState, type Extension, type Transaction } from '@codemirror/state';
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';

import { createEditorView } from '../createEditorView';
import { padCellContent, resolveLogicalCell } from './tableGeometry';

/**
 * Tags a root transaction as forwarded from the active cell's own nested
 * editor — lets `reconcileNestedFromRoot` (below) tell "this change came
 * from me" apart from "the document changed some other way" (undo/redo,
 * an edit made elsewhere while this cell is active), without needing a
 * second, independent bookkeeping mechanism.
 */
export const tableCellForward = Annotation.define<boolean>();

/**
 * Tags a nested-editor transaction as the controller's own content reset
 * (a cell switch's full-document replace, or `reconcileNestedFromRoot`'s
 * resync) — `forwardToRoot` must never forward one of these back onto the
 * root: it isn't a user edit, and forwarding it would try to overwrite the
 * root's own text a second time at the (by then already-updated) anchor,
 * corrupting whatever the root actually holds rather than syncing to it.
 */
const cellContentReset = Annotation.define<boolean>();

/**
 * Dispatched on the root view at the end of `activate()` — a pure
 * activation change (click, Tab/Shift-Tab, Arrow) carries no document
 * change of its own, so without this marker `tableWidgetField`'s
 * `StateField.update()` (which only rebuilds `if (tr.docChanged)`, M1)
 * would never see that a different cell is now active and would keep
 * rendering the nested editor mounted in the *previous* cell's `<td>`
 * (M5, docs/table-implementation-plan.md). Same "changeless marker
 * effect signals a StateField to rebuild" pattern `imageUiState.ts`'s own
 * `presentationOnlyEdit`/`setImageUiState` already establish — not a new
 * mechanism.
 */
export const tableActiveCellChanged = StateEffect.define<null>();

/**
 * The `selection` field to fold into a table interaction's own root-view
 * dispatch, collapsing a stale non-empty root `EditorSelection` in place —
 * or `{}` (nothing) when the root selection is already empty, so spreading
 * this into a dispatch call contributes no field at all rather than a
 * redundant no-op collapse.
 *
 * **Ownership boundary, not a general-purpose selection fixer (2026-09-27,
 * table-selection state + visual milestone).** Every table interaction
 * that takes over a mousedown or keyboard command from CM6 — cell
 * activation (`activate()`, below), a column/row handle click
 * (`tableHandleOverlay.ts`) — inherits, in that moment, the "reconcile a
 * stale selection" responsibility CM6's own `contentDOM` mousedown handler
 * would otherwise have discharged automatically, simply by virtue of
 * having intercepted the event before CM6 could. This is *not* the same
 * problem `attachTableOutsideClickHandling`'s own root-selection-collapse
 * fallback (`tableSelection.ts`) solves — that one resolves a *new* click
 * position for a click landing genuinely outside `contentDOM`; this one
 * has no click position to resolve at all (the interaction target is a
 * cell or a handle, not a document position) and simply collapses root's
 * *own* selection to its own current head, in place. Never dispatches
 * itself — every caller must fold this into the *same* transaction that
 * also sets its own table-interaction effect(s), never a second,
 * independent dispatch for the same gesture (the exact class of bug the
 * 2026-09-27 double-click regression traced back to: two dispatches racing
 * for one physical interaction).
 *
 * Collapses to `main.head`, not a resolved click/cell position — there is
 * no meaningful "where the pointer landed in root's own document" for a
 * click that never touched root content at all; collapsing in place is
 * sufficient to make the stale selection stop rendering, which is the
 * entire contract here.
 *
 * Deliberately does not touch `tableRootSelectionSnap.ts`'s own territory:
 * that filter keeps a *still-current* selection's endpoints out of a
 * table's replaced range (a positional-validity concern, running on every
 * selection-affecting transaction regardless of table interaction); this
 * function only ever fires at the specific moment a table interaction has
 * just taken ownership, addressing a selection that has *become stale*,
 * not one that is still the user's intentional current selection (e.g. a
 * `Ctrl+A` spanning the table, left completely alone unless and until the
 * user then goes on to interact with the table itself).
 */
export function getRootSelectionCollapse(view: EditorView): { selection?: { anchor: number } } {
  const main = view.state.selection.main;
  if (main.empty) {
    return {};
  }
  return { selection: { anchor: main.head } };
}

export interface CellRange {
  readonly from: number;
  readonly to: number;
}

/**
 * Owns the single reusable nested `EditorView` for a table's active cell
 * (Architecture E, ADR-034 — docs/table-implementation-plan.md, M2). One
 * instance per root `EditorView` (§D) — this class holds no module-level
 * state, so that scoping is entirely the caller's to establish (not yet
 * done — this milestone doesn't wire a controller into
 * `MarkdownEditor.tsx`/`buildEditorExtensions.ts`).
 *
 * Not yet wired into the live editing path (`buildEditorExtensions.ts`/
 * `MarkdownEditor.tsx` — M5). Exercised only by this file's own tests and
 * `tableCellNavigation.test.ts`'s (M4), the same "direct unit tests
 * against a test `EditorView`" style the ADR-034 prototype itself was
 * verified with — no click handler reaches this yet.
 */
export class TableActiveCellController {
  private nestedViewInstance: EditorView | null = null;
  private anchor: CellRange | null = null;
  /**
   * The cell's own raw, untrimmed `[leftDelimiterTo, rightDelimiterFrom)`
   * gap — always set together with `anchor` (never independently null once
   * a cell is active), kept in sync by `remapActiveAnchor` the same way.
   * `anchor` alone is what the nested editor's content is sliced from
   * (real content only, per the nested-editor-is-content-only contract);
   * this is the *padding-inclusive* range `forwardToRoot` reconstructs
   * into — see `padCellContent`'s own doc comment for why a plain
   * `anchor`-offset incremental forward can never correctly preserve
   * padding on its own.
   */
  private rawAnchor: CellRange | null = null;
  private forwarding = false;
  private nestedExtensions: readonly Extension[] = [];

  /**
   * `remapActiveAnchor`'s own re-entrancy guard state — see that method's
   * doc comment for why this is needed at all. `lastRemapStartState`
   * identifies which `tr.startState` `anchorBeforeLastRemap`/
   * `rawAnchorBeforeLastRemap` were captured against; `null` until the
   * first `remapActiveAnchor` call.
   */
  private lastRemapStartState: EditorState | null = null;
  private anchorBeforeLastRemap: CellRange | null = null;
  private rawAnchorBeforeLastRemap: CellRange | null = null;

  /**
   * Extra extensions installed on the nested `EditorView` the next time it
   * is lazily created — the seam `tableCellNavigation()` (M4,
   * docs/table-implementation-plan.md) hooks into, since a navigation
   * keymap needs a reference to this same controller instance, which
   * doesn't exist yet at this controller's own construction time. A
   * setter rather than a constructor parameter for exactly that reason;
   * a no-op once the nested view already exists (call before the first
   * `activate()`).
   */
  setNestedExtensions(extensions: readonly Extension[]): void {
    this.nestedExtensions = extensions;
  }

  /** The one reusable nested `EditorView`, once at least one cell has been activated — `null` before that. */
  get nestedView(): EditorView | null {
    return this.nestedViewInstance;
  }

  /** The active cell's current root-document range, kept in sync by `remapActiveAnchor` — `null` when no cell is active. */
  get activeAnchor(): CellRange | null {
    return this.anchor;
  }

  /**
   * Activates the cell `[from, to)` of `rootView`'s current document,
   * mounting the nested editor (created lazily on first call, reused on
   * every subsequent one — verified by this file's own instance-creation
   * counter test) into `container`, caret at `cursorPos` (an absolute
   * root-document position, clamped into the cell).
   *
   * `from`/`to` must always be resolved fresh from current root state at
   * call time, never a range cached from an earlier click/render — this
   * is what a caller must do to avoid ADR-034's own "stale click-handler
   * closures" bug (a widget's inactive-cell click handler that closed
   * over a range captured at widget-build time mounted the wrong,
   * offset substring after an earlier edit shifted positions). This
   * method itself has no cache to go stale from — every call re-derives
   * the cell's text straight from `rootView.state`.
   *
   * `sourceEvent`, when given, is the *original* `mousedown` that caused
   * this activation (`TableWidget.buildRow`'s inactive-cell click handler
   * — the one caller that passes one; every keyboard-driven caller in
   * `tableCellNavigation.ts`/`tableBoundaryNavigation.ts`/
   * `tableRangeSelectionTyping.ts` omits it). It is forwarded, once the
   * nested editor's own DOM is real and in its final position (see
   * "Forwarding timing" below), as a genuine synthetic `mousedown` at the
   * nested view's own `contentDOM` — letting CM6's own native mouse-
   * selection machinery (`handlers.mousedown`/`basicMouseSelection`,
   * `@codemirror/view`) own the *entire* gesture from that point on,
   * including the exact-character caret placement `cursorPos` alone
   * cannot express, and — the reason this replaced a plain coordinate
   * refinement — real drag-to-select and double/triple-click semantics,
   * which a one-shot `posAtCoords` call could never produce.
   *
   * **Why forwarding, not a one-shot coordinate refinement (2026-09-27
   * correction — replaces this method's previous `clickCoords`
   * parameter).** `TableWidget.buildRow`'s own inactive-cell `mousedown`
   * listener calls `preventDefault()`/`stopPropagation()` on the
   * *original* event before this method ever mounts the nested editor —
   * required so root CM6's own `contentDOM` listener (further up the same
   * tree) doesn't also process the click (`TableWidget`'s own doc
   * comment). But that means the nested editor's own `contentDOM` — which
   * doesn't exist yet at that moment — never receives the initiating
   * event at all, so CM6's own native mouse-selection tracking
   * (`@codemirror/view`'s internal `MouseSelection`, which installs its
   * own `document`-level `mousemove`/`mouseup` listeners) never gets
   * initialized for this gesture. Confirmed directly, live: a real
   * mousedown-drag across text in a *previously inactive* cell collapsed
   * to a plain caret at the drag's start position — the drag itself was
   * silently lost — while the identical drag against an *already active*
   * cell worked correctly, because that cell's nested `contentDOM`
   * already existed and received its own initiating `mousedown` natively.
   * A one-shot `posAtCoords`-and-dispatch-a-collapsed-cursor (this
   * method's previous behavior) only ever fixed the *placement*, never
   * the lost drag itself. Forwarding the *original* event as a real
   * `mousedown` at the now-existing `contentDOM` closes that gap
   * directly: CM6's own `handlers.mousedown` performs the identical
   * `posAndSideAtCoords` resolution a plain refinement did, *and* installs
   * its own drag-tracking, from one single mechanism — not two.
   * Confirmed this doesn't need to cover double-/triple-click itself:
   * only the *first* `mousedown` of such a gesture is the one this method
   * ever intercepts (it activates the cell); by the second/third
   * `mousedown`, the cell is already active and `TableWidget.buildRow`'s
   * *other* branch (no `activate()` call) lets CM6 see those natively,
   * exactly as it always has — confirmed live, unaffected by this change
   * either way.
   *
   * **Forwarding timing.** Dispatched at the exact point this method's
   * own previous `clickCoords` refinement used to run — after the
   * `tableActiveCellChanged` dispatch below, never before. Calling
   * `posAndSideAtCoords`/dispatching any mousedown earlier measures
   * against the transient, doubled-up DOM state this method's own next
   * paragraph documents (the nested view freshly appended *alongside*
   * `container`'s still-present static HTML, before `tableWidgetField`'s
   * synchronous rebuild re-parents it into its final, clean wrapper) —
   * confirmed, previously, to resolve to the wrong position (position 0)
   * when attempted too early. The same timing constraint that governed
   * the old coordinate refinement governs the forwarded event for the
   * identical reason: both need the nested `contentDOM`'s *real*, final
   * layout to measure anything against.
   *
   * **No two competing mechanisms.** This forwarded `mousedown` is the
   * *only* thing this method does in response to `sourceEvent` — there is
   * no separate `posAtCoords`/dispatch alongside it. A plain click with no
   * drag still ends up with exactly the same collapsed-caret-at-the-
   * click-point result as before: CM6's own `basicMouseSelection`
   * produces a plain cursor for `event.detail === 1` with no subsequent
   * `mousemove`, identical in effect to the old refinement, just arrived
   * at via CM6's own real mechanism instead of a hand-rolled duplicate of
   * it.
   *
   * **Never bubbles.** Dispatched with `bubbles: false` — its only job is
   * to reach the nested `contentDOM`'s own `mousedown` listener; it must
   * not re-enter root's own `contentDOM` handling or
   * `attachTableOutsideClickHandling`'s `document`-level listener a
   * second time for the same physical gesture (confirmed empirically: a
   * `document`-level observer sees zero events from this dispatch).
   */
  activate(rootView: EditorView, container: HTMLElement, from: number, to: number, cursorPos: number, sourceEvent?: MouseEvent): void {
    const text = rootView.state.sliceDoc(from, to);
    const caret = Math.max(0, Math.min(cursorPos - from, text.length));
    // Set before any dispatch below — forwardToRoot (fired synchronously
    // by the reset dispatch's own updateListener) must see this cell's
    // anchor, not a stale one left over from whichever cell was active
    // before (harmless here since the reset dispatch is tagged and never
    // forwarded anyway, but keeping anchor/dispatch order correct avoids
    // relying on that guard alone).
    this.anchor = { from, to };
    // Re-resolved from the tree, independent of what `from`/`to` happened
    // to collapse to for this call (a trimmed content boundary — for an
    // empty cell, both callers of `activate()` collapse this to a single
    // point somewhere in the raw gap, which is exactly the position
    // `padCellContent` needs to *not* anchor on; the actual padding-
    // inclusive gap is only ever recoverable from `CellBounds`). Falls
    // back to `{from, to}` itself only if resolution genuinely fails
    // (never true for a real click/keyboard activation inside an actual
    // table cell — every production call site's `from` always sits inside
    // one), so `rawAnchor` is never independently null once `anchor` is set.
    const logical = resolveLogicalCell(rootView.state, from);
    this.rawAnchor = logical
      ? { from: logical.bounds.leftDelimiterTo, to: logical.bounds.rightDelimiterFrom }
      : { from, to };

    if (!this.nestedViewInstance) {
      this.nestedViewInstance = createEditorView({
        doc: text,
        parent: container,
        enableHistory: false,
        extensions: [
          keymap.of([
            {
              key: 'Mod-z',
              run: () => {
                undo(rootView);
                return true;
              },
            },
            {
              key: 'Mod-y',
              mac: 'Mod-Shift-z',
              run: () => {
                redo(rootView);
                return true;
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            this.forwardToRoot(rootView, update);
          }),
          ...this.nestedExtensions,
        ],
      });
      this.nestedViewInstance.dispatch({ selection: { anchor: caret } });
    } else {
      if (this.nestedViewInstance.dom.parentElement !== container) {
        container.appendChild(this.nestedViewInstance.dom);
      }
      this.nestedViewInstance.dispatch({
        changes: { from: 0, to: this.nestedViewInstance.state.doc.length, insert: text },
        selection: { anchor: caret },
        annotations: [cellContentReset.of(true)],
      });
    }

    // Explicit focus (M5 fix) — `container.appendChild`/`createEditorView`
    // mounting the nested view's DOM does not itself move browser focus;
    // confirmed by direct live-browser investigation that without this,
    // focus silently stayed on the root editor after a click, so the very
    // next keystroke was processed by root (at whatever position root's
    // own — separately triggered, see `tableWidget.ts`'s click-handler
    // `stopPropagation` fix — click handling had left its selection),
    // producing a stray edit outside the clicked cell instead of inside
    // it. `EditorView.focus()` is CM6's own documented API for this
    // (`@codemirror/view`'s own `EditorView.prototype.focus` doc
    // comment: "Put focus on the editor"). Must run before the
    // `tableActiveCellChanged` dispatch below: that dispatch synchronously
    // triggers `tableWidgetField`'s rebuild, which may reattach this same
    // `nestedViewInstance.dom` into a freshly built `<td>`
    // (`TableWidget.toDOM()`, M5's "preserve focus across rebuilds" fix) —
    // that logic decides whether to restore focus based on whether the
    // view `hasFocus` *at the start of that rebuild*, so focus must
    // already be established here, first.
    this.nestedViewInstance.focus();

    // Tells tableWidgetField's StateField to rebuild even though nothing
    // in rootView's own document changed — see tableActiveCellChanged's
    // own doc comment. A no-op transaction (no changes, not added to
    // history) wherever tableWidgetField isn't installed (every M1–M4
    // test `EditorView` above included).
    //
    // `getRootSelectionCollapse` is folded into this same transaction,
    // never a second dispatch — see that function's own doc comment. This
    // is the one place every cell-activation path (mouse click,
    // `TableWidget.buildRow`'s inactive-cell handler, and every
    // keyboard-driven caller in `tableCellNavigation.ts`/
    // `tableBoundaryNavigation.ts`/`tableRangeSelectionTyping.ts`) already
    // funnels through, so this single call covers all of them uniformly —
    // no separate reconciliation needed at any of those call sites. Root's
    // selection only, never the nested view's own (this dispatch is on
    // `rootView`, not `this.nestedViewInstance`) — the nested editor's own
    // selection, set moments ago above and refined further below by
    // forwarding, is completely unaffected.
    rootView.dispatch({ effects: tableActiveCellChanged.of(null), ...getRootSelectionCollapse(rootView) });

    // Forwards the original gesture to CM6's own native mouse-selection
    // handling — see this method's own "Why forwarding" doc comment for
    // the full reasoning and "Forwarding timing" for why this must run
    // here, after the `tableActiveCellChanged` dispatch above, never
    // before (identical timing constraint the previous coordinate-only
    // refinement already had, for the identical reason: the nested
    // `contentDOM` is only in its final, measurable position once that
    // dispatch's synchronous `tableWidgetField` rebuild has re-parented
    // it there).
    //
    // `bubbles: false` — this dispatch's only job is to reach the nested
    // `contentDOM`'s own `mousedown` listener (`@codemirror/view`'s
    // `handlers.mousedown`, installed directly on that element); it must
    // never continue on to root's own `contentDOM` or to
    // `attachTableOutsideClickHandling`'s `document`-level listener,
    // which would otherwise see a second `mousedown` for this same
    // physical gesture.
    //
    // Every field CM6's own `handlers.mousedown`/`basicMouseSelection`
    // actually reads is forwarded: `clientX`/`clientY` (position
    // resolution), `button` (must be `0`, the only button
    // `basicMouseSelection` engages for), `detail` (click-count — word/
    // line-select; in practice always `1` here, since a `detail` of `2`/
    // `3` never reaches this method at all — see this method's own doc
    // comment), `shiftKey` (extend-selection), and `ctrlKey`/`metaKey`/
    // `altKey` (multi-cursor-add modifier, and a faithful forward for any
    // future CM6 extension that reads them — no cost to include).
    if (sourceEvent) {
      const forwarded = new MouseEvent('mousedown', {
        clientX: sourceEvent.clientX,
        clientY: sourceEvent.clientY,
        button: 0,
        detail: sourceEvent.detail,
        shiftKey: sourceEvent.shiftKey,
        ctrlKey: sourceEvent.ctrlKey,
        metaKey: sourceEvent.metaKey,
        altKey: sourceEvent.altKey,
        bubbles: false,
        cancelable: true,
      });
      this.nestedViewInstance.contentDOM.dispatchEvent(forwarded);
    }
  }

  /**
   * Un-mounts the nested editor's DOM without destroying it — the same
   * instance is reused on the next `activate()` (§D/§A's "one reusable
   * `EditorView`", not a fresh instance per cell switch).
   */
  deactivate(): void {
    this.nestedViewInstance?.dom.remove();
    this.anchor = null;
    this.rawAnchor = null;
  }

  /**
   * Rebuilds the cell's whole raw gap from the nested editor's current
   * (content-only) document, rather than incrementally forwarding each
   * nested change at a fixed `anchor`-relative offset — the offset-forward
   * approach silently discarded padding whenever the nested edit's own
   * position didn't already coincide with a real content boundary, most
   * visibly for an empty cell (nested doc `""`, so *every* insert starts
   * at nested position 0, offset-forwarded straight to `anchor.from` — the
   * raw gap's own left edge, immediately after the opening `|`, jumping
   * every existing padding space to the *right* of the just-typed text
   * instead of leaving it in place). Reconstructing the full
   * `[rawAnchor.from, rawAnchor.to)` gap via `padCellContent` on every
   * change sidesteps that entirely: padding is never "forwarded," it's
   * rebuilt fresh around whatever content the nested editor currently
   * holds, preserving the gap's existing width (growing it only if
   * content overflows) regardless of where inside that content this
   * particular edit landed.
   */
  private forwardToRoot(rootView: EditorView, update: ViewUpdate): void {
    if (!update.docChanged || !this.anchor || !this.rawAnchor || this.forwarding) {
      return;
    }
    if (update.transactions.some((tr) => tr.annotation(cellContentReset))) {
      return;
    }
    const { from: rawFrom, to: rawTo } = this.rawAnchor;
    const rawContent = update.state.doc.toString();
    // A cell's raw gap is always exactly one Markdown source line — the
    // `Enter` key is already intercepted (`tableCellNavigation.ts`) to keep
    // typed content single-line, but nothing guarded a *pasted* embedded
    // newline (declined by table-paste interception as non-tabular, then
    // inserted verbatim by CM6's own default paste) from reaching here and
    // splitting this line in two. Collapsed the same way `normalizeGrid`
    // already collapses an embedded newline inside a single tabular cell.
    const content = rawContent.replace(/\r?\n/g, ' ');
    if (content !== rawContent && this.nestedViewInstance) {
      // Keep the nested editor's own display in sync with what's actually
      // being written to root — otherwise the cell would keep showing the
      // rejected multi-line text until the next activation. `cellContentReset`
      // marks this as not itself a user edit, so it isn't forwarded again.
      this.nestedViewInstance.dispatch({
        changes: { from: 0, to: rawContent.length, insert: content },
        annotations: [cellContentReset.of(true)],
      });
    }
    const replacement = padCellContent(content, rawTo - rawFrom);
    if (rootView.state.sliceDoc(rawFrom, rawTo) === replacement) {
      return;
    }
    this.forwarding = true;
    try {
      rootView.dispatch({
        changes: { from: rawFrom, to: rawTo, insert: replacement },
        annotations: [tableCellForward.of(true)],
      });
    } finally {
      this.forwarding = false;
    }
  }

  /**
   * Remaps the tracked active-cell anchor through a root transaction.
   * **Must be called synchronously from `tableWidgetField`'s own
   * `StateField.update()`, before it rebuilds decorations for the same
   * transaction** — never from an `EditorView.updateListener`. This is
   * ADR-034's own "StateField/updateListener ordering hazard" fix: a
   * `StateField.update()` runs synchronously during transaction
   * application, before any `updateListener` fires for that same
   * transaction, so position tracking a `StateField`'s own decoration
   * output depends on must live at that same synchronous layer — the
   * prototype's own reproduction was a structural row-insert that,
   * remapped only from an `updateListener`, mounted the editor into the
   * wrong (newly inserted) row.
   *
   * **Structural-change safety (M3, docs/table-implementation-plan.md):**
   * a plain `ChangeSet.mapPos` remap is correct for an ordinary edit
   * anywhere else in the document (including a row inserted above/below
   * this cell — mapPos already shifts the anchor correctly, same as any
   * other text insertion), but is not enough on its own when the edit
   * removes the structure the anchor depends on — the active row deleted
   * entirely, or the active cell's whole table deleted. In both cases the
   * naive mapped position can land inside a *different*, structurally
   * unrelated cell that merely happens to now occupy that offset —
   * exactly the "silent mis-association" bug class ADR-034 warns is
   * systemic, not a one-off. Guarded here by re-resolving the mapped
   * position through `resolveLogicalCell` (`tableGeometry.ts`, retained/
   * rendering-mechanism-agnostic by design): if the position no longer
   * resolves into *any* table cell at all, the structure is gone and this
   * deactivates cleanly rather than risk mounting into the wrong one. A
   * cell whose own *content* was cleared (e.g. select-all-and-delete
   * inside it) still resolves here — its row/table nodes are untouched,
   * only the interior text changed — so this never deactivates a merely-
   * emptied cell.
   *
   * **Re-entrancy against CM6's own speculative `tr.state` evaluation
   * (found live via this table's own multi-keystroke test).** `tr.state`
   * is a lazy getter (`EditorState.applyTransaction`, computed once per
   * `Transaction` object and cached on it) — but a *later*-registered
   * `EditorState.transactionFilter` (`tableRectangularNormalization.ts`)
   * reads it to inspect the post-edit tree before deciding its own edits,
   * which forces this `StateField`'s `update()` — and therefore this
   * method — to run against an *intermediate* `Transaction` object that
   * may never become the one actually dispatched (`resolveTransaction`
   * can go on to merge further filter edits into a *different*, final
   * `Transaction`, itself evaluated separately). Both objects share the
   * same `tr.startState` but are otherwise independent transactions over
   * that same starting point. Because this method *mutates* persistent
   * controller state (`anchor`/`rawAnchor`), not just a pure decoration
   * value, two such calls for the same `startState` must never compound —
   * the second must remap from the *original* pre-remap anchor, exactly
   * like the first did, not from whatever the first already produced
   * (confirmed as a real, reproducible corruption: consecutive keystrokes
   * forwarded into the wrong root-document range, eventually swallowing a
   * neighboring cell's own delimiter). Snapshotting/restoring keyed on
   * `tr.startState` identity — stable and unique per real edit, regardless
   * of how many times CM6 speculatively re-evaluates it — is what makes
   * every such call idempotent.
   */
  remapActiveAnchor(tr: Transaction): void {
    if (tr.startState === this.lastRemapStartState) {
      this.anchor = this.anchorBeforeLastRemap;
      this.rawAnchor = this.rawAnchorBeforeLastRemap;
    } else {
      this.lastRemapStartState = tr.startState;
      this.anchorBeforeLastRemap = this.anchor;
      this.rawAnchorBeforeLastRemap = this.rawAnchor;
    }

    if (!this.anchor || !tr.docChanged) {
      return;
    }
    const mappedContentFrom = tr.changes.mapPos(this.anchor.from, -1);

    if (!resolveLogicalCell(tr.state, mappedContentFrom)) {
      this.deactivate();
      return;
    }

    // `rawAnchor`'s own bounds sit at the raw gap's outer edges — always
    // boundary-exact under any edit shape this cell can undergo (an
    // ordinary edit elsewhere, or this controller's own `forwardToRoot`
    // replacing the *entire* `[rawAnchor.from, rawAnchor.to)` gap, and
    // that replacement's own undo/redo — both are, from `mapPos`'s own
    // perspective, a plain replace whose boundaries exactly coincide with
    // `rawAnchor`'s), so a plain outward mapPos (`-1`/`+1`) remains
    // trustworthy for it, unlike for `anchor` itself (see below).
    const rawFrom = this.rawAnchor ? tr.changes.mapPos(this.rawAnchor.from, -1) : mappedContentFrom;
    const rawTo = this.rawAnchor ? tr.changes.mapPos(this.rawAnchor.to, 1) : mappedContentFrom;
    this.rawAnchor = { from: rawFrom, to: rawTo };

    // `anchor` (the content-only boundary) is **not** safe to carry
    // through a plain mapPos of its own old bounds the same way: for any
    // edit that replaces the cell's *whole* raw gap in one go — this
    // controller's own `forwardToRoot` dispatch, or its undo/redo —
    // `anchor.from`/`.to` sit *strictly inside* that replaced range
    // (interior, not boundary), and `ChangeDesc.mapPos` collapses an
    // interior position to one edge of the replacement (confirmed
    // directly: `-1`/`+1` pull `from`/`to` to *opposite* edges of the new
    // text, so `anchor` ends up spanning the entire new gap, padding
    // included — the exact content/padding conflation `padCellContent`
    // exists to prevent). Re-deriving it fresh — trim the *current* text
    // within the already-correctly-remapped `rawAnchor` — sidesteps that
    // ambiguity outright rather than trying to special-case which edit
    // shapes are "safe."
    const text = tr.state.sliceDoc(rawFrom, rawTo);
    const trimmed = text.trim();
    if (trimmed === '') {
      // An emptied cell (this edit's own doing, or already empty):
      // collapses to wherever the *edit itself* landed, matching this
      // controller's pre-existing "content loss is not structural loss"
      // contract — not a fixed rawFrom-based convention, since a plain
      // in-place deletion (e.g. select-all-and-delete inside a
      // previously non-empty cell) has a real, meaningful collapse point
      // of its own that a re-derived rawFrom would discard.
      this.anchor = { from: mappedContentFrom, to: mappedContentFrom };
      return;
    }
    const leading = text.length - text.trimStart().length;
    const trailing = text.length - text.trimEnd().length;
    this.anchor = { from: rawFrom + leading, to: rawTo - trailing };
  }

  /**
   * Re-syncs the nested editor's document from root state, for a root
   * change that did **not** originate from this controller's own
   * `forwardToRoot` — undo/redo, or an edit made elsewhere while this
   * cell is active. Safe to call from an `updateListener` (§C) — unlike
   * `remapActiveAnchor`, nothing here gates decoration correctness, only
   * keeps the nested editor's own content from drifting out of sync.
   */
  reconcileNestedFromRoot(rootView: EditorView): void {
    if (!this.nestedViewInstance || !this.anchor) {
      return;
    }
    const expected = rootView.state.sliceDoc(this.anchor.from, this.anchor.to);
    if (this.nestedViewInstance.state.doc.toString() === expected) {
      return;
    }
    this.nestedViewInstance.dispatch({
      changes: { from: 0, to: this.nestedViewInstance.state.doc.length, insert: expected },
      annotations: [cellContentReset.of(true)],
    });
  }

  /** Root editor unmount cleanup (§13) — destroys the nested view for good, unlike `deactivate()`. Wired from `MarkdownEditor.tsx`'s own unmount cleanup (M5). */
  destroy(): void {
    this.nestedViewInstance?.destroy();
    this.nestedViewInstance = null;
    this.anchor = null;
    this.rawAnchor = null;
  }
}

/**
 * Root-view `updateListener` extension that calls
 * `controller.reconcileNestedFromRoot()` after every doc-changing root
 * transaction that did **not** originate from this same controller's own
 * `forwardToRoot` (§C, M5, docs/table-implementation-plan.md) — physical
 * `Ctrl+Z`/`Ctrl+Shift+Z` (via the nested editor's own Mod-z/Mod-y keymap
 * calling `undo(rootView)`/`redo(rootView)` directly), or any other edit
 * made elsewhere while this cell is active. `reconcileNestedFromRoot`
 * itself is safe to call from an `updateListener` (unlike
 * `remapActiveAnchor`, which must run synchronously inside the
 * `StateField`'s own `update()` — see that method's own doc comment) —
 * this is deliberately a *separate* extension from `tableWidgetDecoration`,
 * not folded into it, since a `StateField.update()` must stay a pure
 * function with no transaction dispatches of its own, which
 * `reconcileNestedFromRoot`'s nested-view dispatch would violate if called
 * from there.
 */
export function tableActiveCellReconciliation(controller: TableActiveCellController): Extension {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) {
      return;
    }
    if (update.transactions.some((tr) => tr.annotation(tableCellForward))) {
      return;
    }
    controller.reconcileNestedFromRoot(update.view);
  });
}
