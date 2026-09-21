import type { ChangeSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { buildEmptyRowText, findAllTables, getNavigableRows, getRowCellBounds, insertRowAfterPosition, isAlignmentRow, type TableInfo } from './tableGeometry';
import { tableSelectionChanged, type TableSelection } from './tableSelection';

/**
 * "Insert row above"/"Insert row below" from a selected row handle
 * (`TableHandleMenu.tsx`) — row-only this milestone; column insertion and
 * row/column deletion remain future work (see this module's own exported
 * functions' own guards: both return `false` outright for a non-`row`
 * `TableSelection`).
 *
 * **Same transaction shape as `tableSelectionDeletion.ts`/`tableSelectionClear.ts`:**
 * one plain `changes` array plus an explicit `tableSelectionChanged` effect
 * choosing the row to select afterward, with the root selection mapped
 * forward rather than set explicitly — never activating a cell, never
 * leaving a misleading root caret, per the product spec's own "do not
 * activate a cell/nested editor automatically." Reuses the *already*
 * generic `tableSelectionDeletionHistory()` `invertedEffects` provider
 * (`tableSelectionDeletion.ts`'s own doc comment: "any transaction with real
 * `changes` plus a `tableSelectionChanged` effect, regardless of source") —
 * no new history registration needed for undo/redo of the selection half of
 * this operation; the document half is already exact-inverse via CM6's own
 * built-in `history()`, since this is a plain `ChangeSet`.
 *
 * **New row shape.** `buildEmptyRowText(columnCount)` — the exact same
 * "empty row with N pipes" primitive `tableCellNavigation.ts`'s own
 * Enter-creates-a-row already uses — never a hand-built string, so column
 * count/pipe placement conventions can't drift between the two call sites.
 * `columnCount` is always read from the table's own header
 * (`getRowCellBounds`), matching every other structural operation in this
 * table feature (`tableSelectionDeletion.ts`, `tableSelectionClear.ts`) —
 * never from the selected row itself, which may be ragged.
 *
 * **Header promotion (insert-above only).** Inserting above the header
 * (`rowIndex === 0`) cannot simply prepend a line above it — GFM requires
 * the delimiter/alignment row to immediately follow the header, so a table
 * can have at most one header, always its very first content line. Making
 * the new row *become* the header while preserving the old header's own
 * content (rather than discarding it) therefore takes two changes in the
 * same transaction: the header's own `[from, to)` is replaced with a fresh
 * blank row (becoming the new header in place, keeping the delimiter row
 * immediately after it, untouched), and the *old* header's own original
 * text is re-inserted verbatim immediately after the delimiter row (becoming
 * the table's new first body row). Both changes target positions that stay
 * valid relative to each other within one `ChangeSet` (CM6 resolves a
 * same-transaction change list against the *original* document, not
 * sequentially), so no manual offset bookkeeping is needed despite the
 * earlier change altering the header's own length.
 *
 * **Insert-below never needs a header special case.** `insertRowAfterPosition`
 * (`tableGeometry.ts`) already resolves "immediately after this row" to the
 * delimiter row's own `.to` when `row` is the header, and to the row's own
 * plain `.to` otherwise — so a single code path handles "insert below the
 * header" (a new body row right after the delimiter row, matching the
 * product spec's "keep the existing header unchanged... insert an empty
 * body row immediately below it") and "insert below a body row" identically.
 */

function columnCountOf(table: TableInfo): number {
  const header = getNavigableRows(table.node)[0];
  return header ? getRowCellBounds(header).length : 0;
}

function dispatchInsertion(view: EditorView, changes: ChangeSpec[], nextSelection: TableSelection): void {
  const changeSet = view.state.changes(changes);
  view.dispatch({
    changes,
    selection: view.state.selection.map(changeSet),
    effects: [tableSelectionChanged.of(nextSelection)],
    scrollIntoView: true,
  });
}

/**
 * Inserts a new row immediately above `rowIndex` and selects it. For the
 * header (`rowIndex === 0`), the new row *becomes* the header and the old
 * header is preserved as the new first body row (see this module's own top
 * doc comment) — the newly-selected row is still `rowIndex` (`0`) either
 * way, since the new row always ends up occupying the exact slot the
 * selection was already pointing at.
 */
function insertRowAbove(view: EditorView, table: TableInfo, rowIndex: number): boolean {
  const navigableRows = getNavigableRows(table.node);
  const row = navigableRows[rowIndex];
  if (!row) {
    return false;
  }
  const columnCount = columnCountOf(table);
  if (columnCount === 0) {
    return false;
  }
  const newRowText = buildEmptyRowText(columnCount);

  let changes: ChangeSpec[];
  if (rowIndex === 0) {
    const alignRow = row.nextSibling;
    if (!alignRow || !isAlignmentRow(alignRow)) {
      return false;
    }
    const oldHeaderText = view.state.sliceDoc(row.from, row.to);
    changes = [
      { from: row.from, to: row.to, insert: newRowText },
      // `alignRow.to` sits *before* the newline already separating it from
      // whatever follows (row/newline boundaries never include the
      // newline itself in either node — see `rowDeletionRange`'s own doc
      // comment) — so the inserted text is prefixed with a newline, not
      // suffixed, letting that existing newline become the separator
      // between the re-inserted old header and the row after it.
      { from: alignRow.to, to: alignRow.to, insert: '\n' + oldHeaderText },
    ];
  } else {
    changes = [{ from: row.from, to: row.from, insert: newRowText + '\n' }];
  }

  dispatchInsertion(view, changes, { kind: 'row', tableFrom: table.from, rowIndex });
  return true;
}

/**
 * Inserts a new row immediately below `rowIndex` and selects it — always at
 * `rowIndex + 1`, whether `row` is the header or a body row (see this
 * module's own top doc comment on why `insertRowAfterPosition` already
 * makes the header case ordinary here).
 */
function insertRowBelow(view: EditorView, table: TableInfo, rowIndex: number): boolean {
  const navigableRows = getNavigableRows(table.node);
  const row = navigableRows[rowIndex];
  if (!row) {
    return false;
  }
  const insertPos = insertRowAfterPosition(row);
  if (insertPos === null) {
    return false;
  }
  const columnCount = columnCountOf(table);
  if (columnCount === 0) {
    return false;
  }
  const newRowText = buildEmptyRowText(columnCount);
  // `insertPos` (`row.to`, or the delimiter row's own `.to` for the header —
  // `insertRowAfterPosition`'s own doc comment) sits *before* the newline
  // already separating it from whatever follows, or at the very end of the
  // document when `row` is the table's last row — prefixing with a newline
  // (not suffixing) is correct either way: it either becomes the new
  // separator ahead of the pre-existing one, or simply starts the brand-new
  // last line. See `insertRowAbove`'s own identical reasoning for the
  // symmetric header-promotion case.
  const changes: ChangeSpec[] = [{ from: insertPos, to: insertPos, insert: '\n' + newRowText }];

  dispatchInsertion(view, changes, { kind: 'row', tableFrom: table.from, rowIndex: rowIndex + 1 });
  return true;
}

/** Exported for `TableHandleMenu.tsx`'s "Insert row above" item — `false` (a no-op) for a non-`row` selection or a table that can no longer be found, mirroring `clearTableSelection`'s/`deleteTableSelection`'s own return-`boolean` contract. */
export function insertRowAboveSelection(view: EditorView, selection: TableSelection): boolean {
  if (selection.kind !== 'row') {
    return false;
  }
  const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return false;
  }
  return insertRowAbove(view, table, selection.rowIndex);
}

/** Symmetric to `insertRowAboveSelection`, for "Insert row below." */
export function insertRowBelowSelection(view: EditorView, selection: TableSelection): boolean {
  if (selection.kind !== 'row') {
    return false;
  }
  const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return false;
  }
  return insertRowBelow(view, table, selection.rowIndex);
}

/**
 * "Duplicate" (row handle menu) — inserts a copy of the selected row's own
 * raw text immediately below it, keeping the *original* row selected, not
 * the new copy. A genuinely dedicated operation, not a compose of
 * `insertRowBelow` + "then also copy content": that function's own
 * contract always selects the *new* row (`rowIndex + 1` — matching
 * "insert below lands on the new row," the correct behavior for a blank
 * insert), which is exactly backwards for Duplicate's own required
 * selection identity (`docs/table-range-selection-clipboard-ux-contract.md`-
 * adjacent milestone's own explicit "keep the existing `TableSelection`
 * pointing to the ORIGINAL row" requirement) — reusing it and then trying
 * to patch the selection back afterward would be a second, redundant
 * dispatch for no benefit over just building the one correct transaction
 * directly.
 *
 * **No header special-case needed.** `insertRowAfterPosition` (`tableGeometry.ts`)
 * already resolves "immediately after this row" to the delimiter row's own
 * `.to` when `row` is the header — the exact same position a *body* row's
 * own duplicate needs relative to `row.to` — so duplicating the header
 * naturally lands its copy as the table's first *body* row, immediately
 * satisfying "duplicate must insert the duplicate BELOW the header as a
 * BODY row... there must still be exactly one header row" without a
 * distinct code path.
 */
function duplicateRow(view: EditorView, table: TableInfo, rowIndex: number): boolean {
  const navigableRows = getNavigableRows(table.node);
  const row = navigableRows[rowIndex];
  if (!row) {
    return false;
  }
  const insertPos = insertRowAfterPosition(row);
  if (insertPos === null) {
    return false;
  }
  const rowText = view.state.sliceDoc(row.from, row.to);
  const changes: ChangeSpec[] = [{ from: insertPos, to: insertPos, insert: '\n' + rowText }];

  // The selection stays on `rowIndex` — the original row, never the new
  // copy — per this operation's own explicit selection-identity
  // requirement.
  dispatchInsertion(view, changes, { kind: 'row', tableFrom: table.from, rowIndex });
  return true;
}

/** Exported for `TableHandleMenu.tsx`'s "Duplicate" item (row handle menu) — `false` (a no-op) for a non-`row` selection or a table that can no longer be found, mirroring every other menu-facing entry point in this file. */
export function duplicateSelectedRow(view: EditorView, selection: TableSelection): boolean {
  if (selection.kind !== 'row') {
    return false;
  }
  const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return false;
  }
  return duplicateRow(view, table, selection.rowIndex);
}
