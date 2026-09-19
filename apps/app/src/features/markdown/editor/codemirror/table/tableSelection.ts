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
      /** Index into `getNavigableRows(table)` — header is index 0, matching `LogicalCell.rowIndex`'s own convention (`tableGeometry.ts`) — never 0 itself: header/delimiter rows are excluded from row selection (this milestone's own UX decision). */
      readonly rowIndex: number;
    }
  | {
      readonly kind: 'range';
      readonly tableFrom: number;
      readonly anchor: { readonly row: number; readonly col: number };
      readonly head: { readonly row: number; readonly col: number };
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
    if (newRowIndex <= 0) {
      // -1: the row itself was deleted, or no longer resolves anywhere.
      // 0: would mean the header — never a valid row-selection target
      // (defensive; the handle overlay never offers a row handle over the
      // header in the first place, per `tableHandleOverlay.ts`).
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
 */
export function attachTableOutsideClickHandling(view: EditorView, controller: TableActiveCellController): () => void {
  const handleMouseDown = (event: MouseEvent): void => {
    const hasActiveCell = controller.activeAnchor !== null;
    const hasSelection = (view.state.field(tableSelectionField, false) ?? null) !== null;
    if (!hasActiveCell && !hasSelection) {
      return;
    }
    const target = event.target;
    if (hasActiveCell && controller.nestedView && target instanceof Node && controller.nestedView.dom.contains(target)) {
      return;
    }
    controller.deactivate();
    view.dispatch({ effects: [tableActiveCellChanged.of(null), tableSelectionChanged.of(null)] });
  };

  const targetDocument = view.dom.ownerDocument;
  targetDocument.addEventListener('mousedown', handleMouseDown);
  return () => {
    targetDocument.removeEventListener('mousedown', handleMouseDown);
  };
}
