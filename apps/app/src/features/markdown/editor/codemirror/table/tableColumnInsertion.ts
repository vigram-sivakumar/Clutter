import type { ChangeSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { splitPipeRowCells } from './tableAlignment';
import { findAllTables, getNavigableRows, getRowColumnSegments, isAlignmentRow, type RowColumnSegment, type TableInfo } from './tableGeometry';
import { tableSelectionChanged, type TableSelection } from './tableSelection';

import type { SyntaxNode } from '@lezer/common';

/**
 * "Insert column left"/"Insert column right" from a selected column handle
 * (`TableHandleMenu.tsx`) — column-only this milestone; row/column deletion
 * remains future work. Mirrors `tableRowInsertion.ts` exactly: one plain
 * `changes` array plus an explicit `tableSelectionChanged` effect naming the
 * column to select afterward, root selection mapped forward (never
 * activating a cell), reusing the already-generic
 * `tableSelectionDeletionHistory()` `invertedEffects` provider for undo/redo
 * of the selection half — no new history registration needed.
 *
 * **Per-row existence check, not a uniform "insert before position N"
 * across every row — this is the one place column insertion diverges from
 * `tableRowInsertion.ts`'s own shape, and deliberately mirrors
 * `tableSelectionDeletion.ts`'s `columnDeletionChangeForRow` instead.** A
 * ragged row (GFM tolerates a row with fewer cells than the header) may not
 * have a real column at the selected `columnIndex` at all —
 * `columnInsertionChangeForRow` below checks `columns[columnIndex]` first
 * and returns `null` (row left untouched) exactly when
 * `columnDeletionChangeForRow` would have. This is "insert right of column
 * `columnIndex`," not "insert before position `columnIndex + 1`," for
 * every non-header row — a subtle but important difference for a ragged
 * row whose own last real column happens to sit before `columnIndex`: such
 * a row simply isn't touched, rather than gaining an empty column at a
 * position that doesn't correspond to anything it actually has. The header
 * and alignment row never have this ambiguity (a table's header always has
 * every column, and the alignment row is 1:1 with the header, never
 * raggable) — only the loop over body rows benefits from it.
 *
 * **Alignment row.** Rebuilt wholesale from its own already-known cell text
 * (`splitPipeRowCells`, plain string splitting — safe here, a delimiter
 * cell can only ever contain `-`/`:`, never an escaped pipe to
 * misinterpret), the same "single opaque `TableDelimiter`, no per-column
 * child nodes to anchor a sub-range edit on" reasoning
 * `tableSelectionDeletion.ts`'s own `alignmentDeletionChange` already
 * documents. The new column's own alignment cell is always plain `---`
 * (unaligned) — this milestone has no UI for choosing an alignment for a
 * brand-new column, matching `tableRowInsertion.ts`'s own "a brand-new row/
 * column starts in the simplest possible shape" precedent
 * (`buildEmptyRowText`'s uniform single-space cells). Every *existing*
 * column's own alignment marker is preserved character-for-character.
 */

/** `left`: insert immediately before `columnIndex`'s own raw content — the new column takes that exact index, shifting the old column (and everything after it) one to the right. `right`: insert immediately after `columnIndex`'s own raw content — anchored on the *existing* column, not a hypothetical "next" position, which is what makes the ragged-row behavior above correct (see this module's own top doc comment). Returns `null` when `row` has no real column at `columnIndex` at all (a ragged row shorter than the header — left untouched, same "preserve ragged rows" reading `columnDeletionChangeForRow` already uses), or when the `right` side has no delimiter to anchor on (a row whose own last column has no trailing pipe — conservative, nothing to touch). */
function columnInsertionChangeForRow(row: SyntaxNode, columnIndex: number, side: 'left' | 'right'): ChangeSpec | null {
  const columns: readonly RowColumnSegment[] = getRowColumnSegments(row);
  const column = columns[columnIndex];
  if (!column) {
    return null;
  }
  if (side === 'left') {
    return { from: column.rawFrom, to: column.rawFrom, insert: ' |' };
  }
  if (!column.rightDelimiter) {
    return null;
  }
  const at = column.rightDelimiter.to;
  return { from: at, to: at, insert: ' |' };
}

/** The alignment/delimiter row's own insertion — always valid at `targetIndex` (`0..cells.length` inclusive), since the alignment row is never ragged relative to the header (a GFM invariant, not something this function needs to guard). */
function alignmentInsertionChange(row: SyntaxNode, rawText: string, targetIndex: number): ChangeSpec {
  const cells = splitPipeRowCells(rawText);
  const next = [...cells];
  next.splice(targetIndex, 0, '---');
  return { from: row.from, to: row.to, insert: '| ' + next.join(' | ') + ' |' };
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
 * Inserts a new column immediately left/right of `columnIndex` and selects
 * it — `targetIndex` (the new column's own resulting index) is `columnIndex`
 * for `left` (the new column takes the exact slot the selection was already
 * pointing at, shifting the old column right) and `columnIndex + 1` for
 * `right`, mirroring `tableRowInsertion.ts`'s own "insert above keeps the
 * same index, insert below is index + 1" convention exactly.
 */
function insertColumn(view: EditorView, table: TableInfo, columnIndex: number, side: 'left' | 'right'): boolean {
  const navigableRows = getNavigableRows(table.node);
  const header = navigableRows[0];
  if (!header) {
    return false;
  }
  const headerColumnCount = getRowColumnSegments(header).length;
  if (columnIndex >= headerColumnCount) {
    return false;
  }
  const targetIndex = side === 'left' ? columnIndex : columnIndex + 1;

  const changes: ChangeSpec[] = [];
  const headerChange = columnInsertionChangeForRow(header, columnIndex, side);
  if (!headerChange) {
    // The header always has every column, by definition — this should be
    // unreachable given the `columnIndex >= headerColumnCount` guard above,
    // but declines rather than guessing if it somehow isn't.
    return false;
  }
  changes.push(headerChange);

  const alignRow = header.nextSibling;
  if (alignRow && isAlignmentRow(alignRow)) {
    changes.push(alignmentInsertionChange(alignRow, view.state.sliceDoc(alignRow.from, alignRow.to), targetIndex));
  }

  for (const row of navigableRows.slice(1)) {
    const change = columnInsertionChangeForRow(row, columnIndex, side);
    if (change) {
      changes.push(change);
    }
  }

  dispatchInsertion(view, changes, { kind: 'column', tableFrom: table.from, columnIndex: targetIndex });
  return true;
}

/** Exported for `TableHandleMenu.tsx`'s "Insert column left" item — `false` (a no-op) for a non-`column` selection or a table that can no longer be found, mirroring `insertRowAboveSelection`'s/`clearTableSelection`'s own return-`boolean` contract. */
export function insertColumnLeftSelection(view: EditorView, selection: TableSelection): boolean {
  if (selection.kind !== 'column') {
    return false;
  }
  const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return false;
  }
  return insertColumn(view, table, selection.columnIndex, 'left');
}

/** Symmetric to `insertColumnLeftSelection`, for "Insert column right." */
export function insertColumnRightSelection(view: EditorView, selection: TableSelection): boolean {
  if (selection.kind !== 'column') {
    return false;
  }
  const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return false;
  }
  return insertColumn(view, table, selection.columnIndex, 'right');
}
