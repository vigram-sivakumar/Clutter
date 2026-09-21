import { StateEffect, StateField, type Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { tableActiveCellChanged, type TableActiveCellController } from './tableActiveCellController';
import { findAllTables, getNavigableRows, getRowCellBounds } from './tableGeometry';

/**
 * Semantic table-selection state (column/row/range) — CM6 extension state
 * distinct from ordinary root document `Selection`, per ADR-034's own
 * "retained" list (docs/adr/034-table-architecture-html-projection-active-cell-editor.md)
 * and `docs/table-implementation-plan.md`'s own §D forward-looking note
 * ("Future: rectangular/row/column/table selection: a separate
 * `StateField<TableSelection | null>`... mirrors `imageUiStateField`'s
 * precedent of one field per orthogonal concern").
 *
 * `range` exists in this type so later milestones don't need a breaking
 * type change to add rectangular/multi-cell selection — this milestone
 * never *produces* one (no drag/shift-click gesture exists yet); see
 * `remapTableSelection`'s own doc comment for how it's handled defensively
 * in the meantime.
 */
export type TableSelection =
  | {
      readonly kind: 'column';
      readonly tableFrom: number;
      readonly columnIndex: number;
    }
  | {
      readonly kind: 'row';
      readonly tableFrom: number;
      /**
       * Index into `getNavigableRows(table)` — header is index 0, matching
       * `LogicalCell.rowIndex`'s own convention (`tableGeometry.ts`). `0`
       * (the header) is a perfectly valid, selectable row like any other —
       * a Markdown table always needing a header is a future structural-
       * operations concern (row/column add, delete, promote), not a
       * selection or content-clearing one, so nothing here excludes it.
       * The delimiter/alignment row is still never a target: it isn't a
       * member of `getNavigableRows`'s own sequence at all (`tableGeometry.ts`'s
       * own doc comment), so no index ever resolves to it.
       */
      readonly rowIndex: number;
    }
  | {
      readonly kind: 'range';
      readonly tableFrom: number;
      readonly anchor: { readonly row: number; readonly col: number };
      readonly head: { readonly row: number; readonly col: number };
      /**
       * The anchor cell's own local caret offset (into its trimmed content,
       * `tableGeometry.ts`'s `startOfCellContent`-relative — not a root
       * document position), captured at the moment the drag gesture began
       * (`tableCellRangeSelection.ts`'s own `beginCellDragTracking`) —
       * `TableActiveCellController.activeAnchor`'s own caret was already
       * correctly established there (by the same `mousedown`'s own
       * `controller.activate()` call, click-coordinate-refined) before
       * `deactivate()` discarded it to start the range. Reactivating the
       * anchor later (typing while the range is selected —
       * `tableRangeSelectionTyping.ts`) restores the caret to exactly
       * where it was, not an arbitrary boundary.
       *
       * Optional, not required: every code path that actually *creates* a
       * `range` selection (the one real producer, `tableCellRangeSelection.ts`)
       * always sets it; test fixtures constructing a `TableSelection`
       * object directly (most of this feature's own test suite) don't need
       * to, and every reader of this field already falls back to a
       * sensible default (content end) when it's absent — see
       * `tableRangeSelectionTyping.ts`'s own doc comment.
       */
      readonly anchorCaretOffset?: number;
    };

/**
 * The single write path for `tableSelectionField` — sets a new selection
 * (a column/row handle click) or clears it (`null`, e.g. a plain click
 * into a cell wants the *absence* of a table selection, dispatched
 * alongside `tableActiveCellChanged` there — see that field's own
 * `update()` for why an explicit `tableSelectionChanged` in the same
 * transaction always wins over a same-transaction `tableActiveCellChanged`).
 */
export const tableSelectionChanged = StateEffect.define<TableSelection | null>();

/**
 * Re-resolves `selection` against `tr`'s resulting document — never a
 * plain `ChangeSet.mapPos` of a cached index, the same discipline
 * `TableActiveCellController.remapActiveAnchor`'s own doc comment
 * establishes and for the identical reason: an index alone (`columnIndex`/
 * `rowIndex`) doesn't survive a structural edit's own `mapPos` (indices
 * aren't document positions), and even `tableFrom` itself must be
 * re-validated, not trusted, once mapped — a mapped position landing where
 * a table's own `.from` used to be doesn't prove a table still starts
 * there.
 *
 * `column`: `tableFrom` is mapped and the table's continued existence
 * there is confirmed; `columnIndex` itself never needs remapping through
 * `mapPos` (row-level edits — insert/delete a row — never shift column
 * indices), only *revalidation* against the table's current header column
 * count (a column past the end, e.g. from an edit that shrinks the
 * header, invalidates the selection).
 *
 * `row`: genuinely needs re-derivation, not just revalidation — a row
 * inserted above the selected row *does* shift its own logical index.
 * Re-derived the same way `TableActiveCellController.remapActiveAnchor`
 * re-derives a cell's identity: find the selected row's own real
 * position in the *old* tree (`tr.startState`), map that real position
 * forward through `tr.changes`, then re-resolve which row (by index) now
 * sits at that mapped position in the *new* tree — never the bare integer
 * index directly, which `mapPos` has no way to interpret.
 *
 * `range`: not produced by any code path yet (no drag/shift-click gesture
 * exists in this milestone) — defensively cleared rather than guessing at
 * a remap strategy for a shape nothing currently creates.
 */
function remapTableSelection(tr: Transaction, selection: TableSelection): TableSelection | null {
  const mappedTableFrom = tr.changes.mapPos(selection.tableFrom, -1);
  const newTable = findAllTables(tr.state).find((t) => t.from === mappedTableFrom);
  if (!newTable) {
    return null;
  }

  if (selection.kind === 'column') {
    const header = getNavigableRows(newTable.node)[0];
    const columnCount = header ? getRowCellBounds(header).length : 0;
    if (selection.columnIndex >= columnCount) {
      return null;
    }
    return { kind: 'column', tableFrom: mappedTableFrom, columnIndex: selection.columnIndex };
  }

  if (selection.kind === 'row') {
    const oldTable = findAllTables(tr.startState).find((t) => t.from === selection.tableFrom);
    const oldRow = oldTable ? getNavigableRows(oldTable.node)[selection.rowIndex] : undefined;
    if (!oldRow) {
      return null;
    }
    const mappedRowPos = tr.changes.mapPos(oldRow.from, 1);
    const newRowIndex = getNavigableRows(newTable.node).findIndex((r) => r.from === mappedRowPos);
    if (newRowIndex < 0) {
      // The row itself was deleted, or no longer resolves anywhere. `0`
      // (the header) is a valid outcome here, same as any other index —
      // see `TableSelection`'s own `row` kind doc comment.
      return null;
    }
    return { kind: 'row', tableFrom: mappedTableFrom, rowIndex: newRowIndex };
  }

  // 'range' — see this function's own doc comment.
  return null;
}

/**
 * `TableSelection`'s own state — separate from `tableWidgetField` (what to
 * render) and `tableDeletionSelectionField` (whole-table delete-arming
 * intent), the same "one field per orthogonal concern" reasoning already
 * governing that split (`tableDeletionSelection.ts`'s own doc comment).
 * `tableWidgetField.ts` only *reads* this field when deciding what to
 * render; it never writes it.
 */
export const tableSelectionField = StateField.define<TableSelection | null>({
  create() {
    return null;
  },
  update(value, tr) {
    // An explicit `tableSelectionChanged` in this transaction is always
    // authoritative — including when it's `null` (a plain cell-click
    // clearing any existing selection) and including when it co-occurs
    // with a `tableActiveCellChanged` effect in the very same transaction
    // (a handle click's own dispatch: it deactivates the active cell *and*
    // sets the new selection together — see `tableHandleOverlay.ts`). Were
    // the `tableActiveCellChanged` check below allowed to run first, a
    // handle click's own accompanying deactivation-effect would
    // immediately null out the selection it just set in the same update.
    const explicitChange = tr.effects.find((e) => e.is(tableSelectionChanged));
    if (explicitChange) {
      return explicitChange.value;
    }
    if (value === null) {
      return null;
    }
    // Mutual exclusivity with the active cell, reusing the existing
    // `tableActiveCellChanged` marker effect rather than a second
    // signaling mechanism (this milestone's own instruction) — an
    // ordinary click into a cell (`TableActiveCellController.activate()`)
    // dispatches only this effect, no `tableSelectionChanged`, so it falls
    // through to here and clears whatever selection existed.
    if (tr.effects.some((e) => e.is(tableActiveCellChanged))) {
      return null;
    }
    if (!tr.docChanged) {
      return value;
    }
    return remapTableSelection(tr, value);
  },
});

/**
 * Clears both the active cell and any `TableSelection` whenever the user
 * clicks anywhere outside the table currently holding one of them —
 * "outside" meaning literally anywhere else: another line in the same
 * root editor, a different table, a totally unrelated part of the app
 * (a sidebar, another note/editor area), or blank space in the editor
 * itself. Returns a cleanup function; call it on the same lifecycle that
 * destroys `controller` (see this function's own "lifecycle" paragraph
 * below) — never re-attach this per table-widget rebuild.
 *
 * **Why a single `document`-level listener is the right mechanism here,
 * not a per-table one.** The three mechanisms that already exist for
 * "isolate a click inside a table's own DOM" —
 * `TableWidget.toDOM()`'s per-cell `mousedown` listener (`buildRow`),
 * its widget-level non-cell-click suppression, and
 * `tableHandleOverlay.ts`'s own hit-area `mousedown` listener — every one
 * of them already calls `stopPropagation()` for a click anywhere inside
 * their own table's rendered DOM. That means any `mousedown` that reaches
 * `document` at all has, by construction, already been *positively ruled
 * out* as "a click inside some table's own interactive surface" by one of
 * those three — this listener does not need to re-derive "was this click
 * inside a table" itself; reaching this handler already answers that
 * question. This is the "outside-click mechanism the current architecture
 * already provides a suitable boundary for" — no second, competing
 * containment check needed, and no per-table wiring (this listener is
 * installed once, is never told which table is involved, and does not
 * care).
 *
 * **The one case that check alone gets wrong, and why it needs an
 * explicit exception.** Clicking *inside the already-active cell's own
 * nested editor content* (repositioning the caret within it, not
 * switching cells) is **not** stopped by any of the three mechanisms
 * above — confirmed directly from `tableWidget.ts`'s own widget-level
 * listener, whose `target.closest('td, th, ...')` check deliberately lets
 * a click *inside* the active cell's own `<td>` fall through untouched
 * (its own doc comment: "an active cell's nested editor... still lives
 * inside a `<td>`, so this check lets both cases fall through
 * untouched"), and the nested `EditorView`'s own internal click-to-caret
 * handling has no reason to call `stopPropagation()` on the *native* DOM
 * event either. Without an explicit exception, clicking inside the very
 * cell the user is already editing — to move the caret, not leave it —
 * would incorrectly deactivate it the moment the event reached
 * `document`. Guarded here via `controller.nestedView.dom.contains(target)`
 * — the one piece of real DOM containment this function does need to
 * check itself, precisely because it is the one case nothing upstream
 * already handles.
 *
 * **Lifecycle.** `TableActiveCellController` is already "one instance per
 * root `EditorView`... constructed alongside the editor, destroyed on
 * unmount" (that class's own doc comment) — this listener's own lifecycle
 * must match exactly, which is why it is a *function you call once,
 * yourself, at the same point the controller itself is constructed*
 * (`MarkdownEditor.tsx`), not something wired into `TableWidget.toDOM()`
 * or `tableHandleOverlay.ts` — both of which run on every table-widget
 * rebuild and would otherwise install a fresh listener on every keystroke,
 * leaking the previous one (this function's own single caller is
 * responsible for calling the returned cleanup function exactly once, on
 * unmount, never per-rebuild).
 *
 * **Second responsibility, added after direct investigation (see
 * `tableSelectionClickDiagnostics.ts`'s own history): explicitly collapsing
 * a non-collapsed root selection on a click that lands outside every
 * table.** For an ordinary document, clicking outside `.cm-content`
 * (empty body space, a click that lands on an ancestor container) still
 * collapses a `Ctrl+A`-wide selection, but not via any code in this
 * codebase — it happens because the *native* browser Selection changes
 * (a text-anchored Range collapses to a text-anchored Caret), and CM6's
 * own `document`-level `selectionchange` listener syncs that back into
 * `state.selection`. **Confirmed directly, side by side, that this native
 * round-trip silently fails whenever the root selection spans a table**:
 * `Ctrl+A` over a document containing a table produces an
 * *element-anchored* native Range (anchor/focus are `.cm-line` DOM
 * elements at a child offset, not text nodes) — because the table's own
 * DOM is `contenteditable="false"`, so the browser has no real text to
 * anchor a "select all" Range to across it. Captured logs showed
 * `selectionchange` still firing on the click, but with the *exact same*
 * anchor/focus/offsets before and after — the native Selection object
 * never actually changes for an element-anchored Range the way it does
 * for a text-anchored one, so CM6's own sync has nothing new to pick up,
 * and `state.selection` is left stuck at the stale `Ctrl+A` range
 * (visible as the table halo never clearing). This is a native-Selection-
 * API quirk around a `contenteditable=false` island, not a bug in
 * `tableRootSelectionSnap`, `TableSelection`, or CM6's own position
 * mapping — `view.posAtCoords()` was confirmed, in the same captured
 * logs, to already resolve the click's screen coordinates correctly.
 *
 * The fix is narrow: when this handler fires at all (i.e. the click
 * wasn't already claimed by a table's own interactive surface — see this
 * doc comment's own first section) and the root selection is currently
 * non-collapsed, resolve the click's own coordinates via
 * `view.posAtCoords()` and dispatch a plain `{selection: {anchor: pos}}`
 * transaction ourselves — the exact transaction the native round-trip
 * would have produced if it hadn't silently failed. Harmless for a
 * table-free document too: `posAtCoords` resolves to the same position
 * the (working) native path would have produced anyway, so this is a
 * correctness backstop, not a behavior change, for that case. Skipped
 * entirely when the root selection is already collapsed (nothing to
 * collapse — avoids a redundant dispatch on every ordinary click) or when
 * `posAtCoords` itself can't confidently resolve a position (returns
 * `null` — declines rather than guessing). Never includes `changes`, so
 * this can never modify the document or enter undo history, and never
 * synthesizes or otherwise touches the *native* DOM Selection — only
 * CM6's own logical `state.selection`.
 */

/**
 * The one CSS class every row/column handle's own floating menu
 * (`TableHandleMenu.tsx`) carries on its root DOM — defined here, not in
 * `tableHandleMenuSync.ts` (which otherwise owns every other table-handle-menu
 * type/mechanism), specifically so `attachTableOutsideClickHandling` below
 * can read it without a circular import (`tableHandleMenuSync.ts` already
 * imports `tableSelectionField`/`TableSelection` from this file). Re-
 * exported from `tableHandleMenuSync.ts` for every other caller, which is the
 * conceptually-correct home for it.
 */
export const TABLE_HANDLE_MENU_CLASS = 'cm-table-handle-menu';

export function attachTableOutsideClickHandling(view: EditorView, controller: TableActiveCellController): () => void {
  const handleMouseDown = (event: MouseEvent): void => {
    const hasActiveCell = controller.activeAnchor !== null;
    const hasSelection = (view.state.field(tableSelectionField, false) ?? null) !== null;
    const target = event.target;
    const clickedInsideActiveCell =
      hasActiveCell && !!controller.nestedView && target instanceof Node && controller.nestedView.dom.contains(target);
    if (clickedInsideActiveCell) {
      return;
    }
    // A fourth exemption, alongside this function's own three DOM-
    // containment-based ones (this doc comment's own first section) — the
    // row/column handle's own menu (`TableHandleMenu.tsx`,
    // `tableHandleMenuSync.ts`'s own `TABLE_HANDLE_MENU_CLASS`) is portaled to
    // `document.body`, never inside any table's own DOM, so none of those
    // three (which all rely on the click already having been claimed
    // *inside* a table's own subtree) can ever recognize it. Required for
    // correctness, not just cosmetic: without this, `mousedown` on a menu
    // item would clear `tableSelectionField` here — closing/unmounting the
    // menu, via `tableHandleMenuSync`, *before* the browser's own
    // subsequent `click` event can fire on that now-removed node. See
    // `TABLE_HANDLE_MENU_CLASS`'s own doc comment for the full reasoning.
    if (target instanceof Element && target.closest(`.${TABLE_HANDLE_MENU_CLASS}`)) {
      return;
    }

    const clearsInteractionState = hasActiveCell || hasSelection;
    if (clearsInteractionState) {
      controller.deactivate();
    }

    // The root-selection-collapse fallback (this function's own doc
    // comment, "Second responsibility") — independent of
    // `clearsInteractionState`: a plain `Ctrl+A` has neither an active
    // cell nor a `TableSelection`, so it would never reach the branch
    // above at all, yet it is the exact scenario this fallback exists
    // for.
    let selectionAnchor: number | null = null;
    if (!view.state.selection.main.empty) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos !== null) {
        selectionAnchor = pos;
      }
    }

    if (!clearsInteractionState && selectionAnchor === null) {
      return;
    }
    view.dispatch({
      effects: clearsInteractionState ? [tableActiveCellChanged.of(null), tableSelectionChanged.of(null)] : [],
      ...(selectionAnchor !== null ? { selection: { anchor: selectionAnchor } } : {}),
    });
  };

  const targetDocument = view.dom.ownerDocument;
  targetDocument.addEventListener('mousedown', handleMouseDown);
  return () => {
    targetDocument.removeEventListener('mousedown', handleMouseDown);
  };
}
