import type { ChangeSpec, EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import type { SyntaxNode } from '@lezer/common';

import { splitPipeRowCells } from './tableAlignment';
import { findAllTables, getNavigableRows, getRowColumnSegments, isAlignmentRow, type TableInfo } from './tableGeometry';
import { tableSelectionChanged, type TableSelection } from './tableSelection';

/**
 * "Move up"/"Move down" (row handle menu) and "Move left"/"Move right"
 * (column handle menu) — swaps a selected row/column with its immediate
 * neighbor. Mirrors `tableRowInsertion.ts`/`tableColumnInsertion.ts`/
 * `tableSelectionDeletion.ts` exactly: one plain `changes` array (however
 * many `ChangeSpec` entries it takes to touch every affected row) dispatched
 * as a single CM6 transaction, plus an explicit `tableSelectionChanged`
 * effect naming the row/column's own new index, with the root selection
 * mapped forward rather than set explicitly. Reuses the already-generic
 * `tableSelectionDeletionHistory()` `invertedEffects` provider
 * (`tableSelectionDeletion.ts`'s own doc comment: "any transaction with real
 * `changes` plus a `tableSelectionChanged` effect, regardless of source") —
 * no new history registration needed for undo/redo of the selection half.
 *
 * **The header is a slot (row index 0), not a row that permanently owns
 * that identity.** Every row is movable, the header included — moving the
 * header down demotes it to an ordinary body row and promotes whichever row
 * takes index 0 to the new header; moving a body row up into index 0
 * promotes it and demotes the old header to a body row. The only real
 * boundaries are the ones any row-major sequence has: the first row (index
 * `0`, whatever currently occupies it) can't move up, and the last row
 * can't move down — `rowMoveAvailability`, below, is this module's own
 * single source of truth for that boundary (reused by both the actual move
 * functions' own guards and `TableHandleMenu.tsx`'s own disabled-state
 * wiring, so the two can never drift apart).
 *
 * **Crossing the header/body boundary reuses the existing header-
 * promotion/demotion shape**, not a new mechanism: `tableRowInsertion.ts`'s
 * own "Insert row above" on the header, and `tableSelectionDeletion.ts`'s
 * own `deleteHeaderRow`, already establish that the header is just "whatever
 * raw text currently occupies row index 0" — the delimiter/alignment row
 * (never part of `getNavigableRows`) always stays exactly where it already
 * is, immediately after index 0, untouched. Swapping the header (index 0)
 * with the first body row (index 1) is therefore the same "rebuild each
 * row's own `[from, to)` in place with the other's raw text" shape those two
 * functions already use for promotion/demotion, not a textually-adjacent
 * splice — the delimiter row physically sits *between* them in the source,
 * so index 0 and index 1 are never adjacent bytes the way two body rows
 * are. Every other swap (both rows at index `>= 1`) has no such gap and
 * uses the ordinary adjacent-splice shape below.
 *
 * **Adjacent-swap shape, not insert-then-delete.** Because "up"/"down"/
 * "left"/"right" only ever move a row/column exactly one position, the two
 * affected rows (or, for a column move, the two affected cells within every
 * row) are always immediate neighbors — so the whole operation is a single
 * range replacement per touched row: slice out the two neighbors' own raw
 * text (and, for rows, the exact separator between them) and reinsert them
 * swapped. This is a genuine, single `ChangeSpec` transformation, never a
 * `delete` change followed by a separate `insert` change for the same
 * content — exactly the "one dedicated mutation, not compose two simpler
 * primitives" shape the milestone spec calls for.
 */

function dispatchMove(view: EditorView, changes: ChangeSpec[], nextSelection: TableSelection): void {
  const changeSet = view.state.changes(changes);
  view.dispatch({
    changes,
    selection: view.state.selection.map(changeSet),
    effects: [tableSelectionChanged.of(nextSelection)],
    scrollIntoView: true,
  });
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** Whether the row at `rowIndex` (into `getNavigableRows`, header included) can move up/down within `navigableRowCount` navigable rows — `false` only at the two physical ends (index `0` can't move up; the last index can't move down). No header-specific restriction: the header is a slot, not a row identity (see this module's own top doc comment) — it's exactly as movable as any other row. The one shared boundary rule this whole module (and `TableHandleMenu.tsx`'s own disabled items) is built on. */
export function rowMoveAvailability(navigableRowCount: number, rowIndex: number): { canMoveUp: boolean; canMoveDown: boolean } {
  return {
    canMoveUp: rowIndex > 0,
    canMoveDown: rowIndex < navigableRowCount - 1,
  };
}

/** Exported for `TableHandleMenu.tsx`'s disabled-state wiring — resolves `selection`'s own table and delegates to `rowMoveAvailability`; `null` for a non-`row` selection or a table that can no longer be found (mirrors this module's own `null`-means-"nothing to compute" convention elsewhere). */
export function resolveRowMoveAvailability(view: EditorView, selection: TableSelection): { canMoveUp: boolean; canMoveDown: boolean } | null {
  if (selection.kind !== 'row') {
    return null;
  }
  const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return null;
  }
  return rowMoveAvailability(getNavigableRows(table.node).length, selection.rowIndex);
}

function moveRow(view: EditorView, table: TableInfo, rowIndex: number, direction: 'up' | 'down'): boolean {
  const navigableRows = getNavigableRows(table.node);
  const { canMoveUp, canMoveDown } = rowMoveAvailability(navigableRows.length, rowIndex);
  if ((direction === 'up' && !canMoveUp) || (direction === 'down' && !canMoveDown)) {
    return false;
  }
  const targetIndex = direction === 'up' ? rowIndex - 1 : rowIndex + 1;
  const indexA = Math.min(rowIndex, targetIndex);
  const indexB = Math.max(rowIndex, targetIndex);
  const rowA = navigableRows[indexA];
  const rowB = navigableRows[indexB];
  if (!rowA || !rowB) {
    return false;
  }

  const textA = view.state.sliceDoc(rowA.from, rowA.to);
  const textB = view.state.sliceDoc(rowB.from, rowB.to);

  let changes: ChangeSpec[];
  if (indexA === 0) {
    // Crossing the header/body boundary — the delimiter row (always
    // `getNavigableRows(...)[1]`'s own immediate predecessor, never a
    // member of `navigableRows` itself) physically sits between index 0
    // and index 1 in the source, so this is never a textually-adjacent
    // splice: each row's own `[from, to)` is independently rebuilt with
    // the other's raw text in place, exactly like `insertRowAbove`'s own
    // header-promotion change and `deleteHeaderRow`'s own demotion change
    // (both `[from,to) -> other text]`, resolved against the *original*
    // document within one `ChangeSet` — see this module's own top doc
    // comment).
    changes = [
      { from: rowA.from, to: rowA.to, insert: textB },
      { from: rowB.from, to: rowB.to, insert: textA },
    ];
  } else {
    // Two ordinary body rows — always textually adjacent (no delimiter row
    // between them), so this is a single range replacement spanning both,
    // with the exact separator already between them (ordinarily a single
    // `\n` — table lines are always contiguous, per GFM — sliced rather
    // than assumed).
    const separator = view.state.sliceDoc(rowA.to, rowB.from);
    changes = [{ from: rowA.from, to: rowB.to, insert: textB + separator + textA }];
  }

  dispatchMove(view, changes, { kind: 'row', tableFrom: table.from, rowIndex: targetIndex });
  return true;
}

/** Exported for `TableHandleMenu.tsx`'s "Move up" item — `false` (a no-op) for a non-`row` selection, a table that can no longer be found, or a boundary move (the table's first row, header or otherwise), mirroring every other menu-facing entry point in this feature's own return-`boolean` contract. */
export function moveSelectedRowUp(view: EditorView, selection: TableSelection): boolean {
  if (selection.kind !== 'row') {
    return false;
  }
  const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return false;
  }
  return moveRow(view, table, selection.rowIndex, 'up');
}

/** Symmetric to `moveSelectedRowUp`, for "Move down." */
export function moveSelectedRowDown(view: EditorView, selection: TableSelection): boolean {
  if (selection.kind !== 'row') {
    return false;
  }
  const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return false;
  }
  return moveRow(view, table, selection.rowIndex, 'down');
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/** Whether the column at `columnIndex` can move left/right within `columnCount` columns — every column can move toward the interior; only the two ends are ever blocked. Symmetric to `rowMoveAvailability` (no header-equivalent concept for columns — every column, including the first, is an ordinary movable column). */
export function columnMoveAvailability(columnCount: number, columnIndex: number): { canMoveLeft: boolean; canMoveRight: boolean } {
  return {
    canMoveLeft: columnIndex >= 1,
    canMoveRight: columnIndex >= 0 && columnIndex < columnCount - 1,
  };
}

/** Exported for `TableHandleMenu.tsx`'s disabled-state wiring — symmetric to `resolveRowMoveAvailability`. */
export function resolveColumnMoveAvailability(view: EditorView, selection: TableSelection): { canMoveLeft: boolean; canMoveRight: boolean } | null {
  if (selection.kind !== 'column') {
    return null;
  }
  const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return null;
  }
  const header = getNavigableRows(table.node)[0];
  const columnCount = header ? getRowColumnSegments(header).length : 0;
  return columnMoveAvailability(columnCount, selection.columnIndex);
}

/**
 * The swap change for one ordinary (non-alignment) `row`'s own columns
 * `indexA`/`indexB` (`indexA < indexB`, always adjacent — `indexB === indexA
 * + 1` for every real caller here) — `null` when this row has no real
 * column at *either* index (a ragged row shorter than the header, left
 * untouched exactly as `columnDeletionChangeForRow`/`columnInsertionChangeForRow`
 * already treat that case, or a row with no delimiters to anchor the swap
 * on at all). Reinserts each column's own raw (untrimmed) text verbatim,
 * swapped, with the delimiter between them (ordinarily a single `|`, sliced
 * rather than assumed) left exactly where it already was — preserving
 * padding, alignment-relative formatting, and escaped pipes inside either
 * cell's own content unchanged, the same "reinsert exactly what was sliced
 * out" discipline `moveRow`'s own row-level swap follows.
 */
function columnSwapChangeForRow(state: EditorState, row: SyntaxNode, indexA: number, indexB: number): ChangeSpec | null {
  const columns = getRowColumnSegments(row);
  const columnA = columns[indexA];
  const columnB = columns[indexB];
  if (!columnA || !columnB || !columnA.rightDelimiter) {
    return null;
  }
  const midDelimiter = columnA.rightDelimiter;
  const textA = state.sliceDoc(columnA.rawFrom, columnA.rawTo);
  const midText = state.sliceDoc(midDelimiter.from, midDelimiter.to);
  const textB = state.sliceDoc(columnB.rawFrom, columnB.rawTo);
  return { from: columnA.rawFrom, to: columnB.rawTo, insert: textB + midText + textA };
}

/** The alignment/delimiter row's own swap — rebuilt wholesale from its own already-known cell text (`splitPipeRowCells`), the same "single opaque `TableDelimiter`, no per-column child nodes to anchor a sub-range edit on" reasoning `tableColumnInsertion.ts`'s own `alignmentInsertionChange` already documents. Each column's own alignment marker (`:left`/`right:`/`:center:`/plain `---`) travels with it, unchanged. */
function alignmentSwapChange(row: SyntaxNode, rawText: string, indexA: number, indexB: number): ChangeSpec {
  const cells = splitPipeRowCells(rawText);
  const next = [...cells];
  const tmp = next[indexA] ?? '';
  next[indexA] = next[indexB] ?? '';
  next[indexB] = tmp;
  return { from: row.from, to: row.to, insert: '| ' + next.join(' | ') + ' |' };
}

function moveColumn(view: EditorView, table: TableInfo, columnIndex: number, direction: 'left' | 'right'): boolean {
  const navigableRows = getNavigableRows(table.node);
  const header = navigableRows[0];
  if (!header) {
    return false;
  }
  const headerColumnCount = getRowColumnSegments(header).length;
  const { canMoveLeft, canMoveRight } = columnMoveAvailability(headerColumnCount, columnIndex);
  if ((direction === 'left' && !canMoveLeft) || (direction === 'right' && !canMoveRight)) {
    return false;
  }
  const targetIndex = direction === 'left' ? columnIndex - 1 : columnIndex + 1;
  const indexA = Math.min(columnIndex, targetIndex);
  const indexB = Math.max(columnIndex, targetIndex);

  const changes: ChangeSpec[] = [];
  const headerChange = columnSwapChangeForRow(view.state, header, indexA, indexB);
  if (!headerChange) {
    // The header always has every column, by definition — unreachable given
    // the availability guard above, declines rather than guessing if it
    // somehow isn't (mirrors `insertColumn`'s/`duplicateColumn`'s own
    // identical defensive shape).
    return false;
  }
  changes.push(headerChange);

  const alignRow = header.nextSibling;
  if (alignRow && isAlignmentRow(alignRow)) {
    changes.push(alignmentSwapChange(alignRow, view.state.sliceDoc(alignRow.from, alignRow.to), indexA, indexB));
  }

  for (const row of navigableRows.slice(1)) {
    const change = columnSwapChangeForRow(view.state, row, indexA, indexB);
    if (change) {
      changes.push(change);
    }
  }

  dispatchMove(view, changes, { kind: 'column', tableFrom: table.from, columnIndex: targetIndex });
  return true;
}

/** Exported for `TableHandleMenu.tsx`'s "Move left" item — `false` (a no-op) for a non-`column` selection, a table that can no longer be found, or a boundary move (the table's first column), mirroring `moveSelectedRowUp`'s own contract. */
export function moveSelectedColumnLeft(view: EditorView, selection: TableSelection): boolean {
  if (selection.kind !== 'column') {
    return false;
  }
  const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return false;
  }
  return moveColumn(view, table, selection.columnIndex, 'left');
}

/** Symmetric to `moveSelectedColumnLeft`, for "Move right." */
export function moveSelectedColumnRight(view: EditorView, selection: TableSelection): boolean {
  if (selection.kind !== 'column') {
    return false;
  }
  const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return false;
  }
  return moveColumn(view, table, selection.columnIndex, 'right');
}
