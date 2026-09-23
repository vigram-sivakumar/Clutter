import type { ChangeSpec, EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import type { SyntaxNode } from '@lezer/common';

import { splitPipeRowCells } from './tableAlignment';
import { arrayMove, findAllTables, getNavigableRows, getRowColumnSegments, isAlignmentRow, type TableInfo } from './tableGeometry';
import { tableSelectionChanged, type TableSelection } from './tableSelection';
import { buildTableColumnWidthsAttributeChange, nextWidthsAfterColumnMove, resolveTableColumnWidths } from './tableColumnWidthMetadata';

/**
 * "Move up"/"Move down" (row handle menu), "Move left"/"Move right" (column
 * handle menu), and the row/column handles' own drag-to-reorder gesture
 * (`tableHandleOverlay.ts`) — all built on the same generalized "move row/
 * column `fromIndex` to `toIndex`" transaction builder (`moveRow`/
 * `moveColumn`, below), never two parallel reorder implementations. The
 * menu actions are the `toIndex = fromIndex ± 1` special case; drag calls
 * the exact same functions directly with whatever arbitrary index the
 * pointer settled on.
 *
 * One plain `changes` array (however many `ChangeSpec` entries it takes to
 * touch every affected row) dispatched as a single CM6 transaction, plus an
 * explicit `tableSelectionChanged` effect naming the row/column's own new
 * index, with the root selection mapped forward rather than set explicitly.
 * Reuses the already-generic `tableSelectionDeletionHistory()`
 * `invertedEffects` provider (`tableSelectionDeletion.ts`'s own doc
 * comment: "any transaction with real `changes` plus a
 * `tableSelectionChanged` effect, regardless of source") — no new history
 * registration needed for undo/redo, including for a multi-position drag
 * reorder: it is still exactly one transaction, so it is exactly one undo
 * step no matter how far the row/column travelled.
 *
 * **The header is a slot (row index 0), not a row that permanently owns
 * that identity.** Every row is movable, the header included — moving the
 * header down demotes it to an ordinary body row and promotes whichever row
 * ends up at index 0 to the new header; dragging a body row up past the
 * header promotes it, demoting the old header to a body row. The only real
 * boundaries are the ones any row-major sequence has: the first row (index
 * `0`, whatever currently occupies it) can't move up, and the last row
 * can't move down — `rowMoveAvailability`, below, is this module's own
 * single source of truth for that boundary (reused by both the ±1 menu
 * actions' own guards and `TableHandleMenu.tsx`'s own disabled-state
 * wiring). Drag has no equivalent restriction to check up front — any
 * `toIndex` inside the table's own navigable-row range is a legal drop
 * target, `moveRow` itself bounds-checks it.
 *
 * **Moving a *range* of rows/columns, not just a pair.** `fromIndex` and
 * `toIndex` may be any distance apart (a drag can travel from the first row
 * straight to the last). This is exactly an array "move element" operation
 * over the slots `[min(fromIndex,toIndex), max(fromIndex,toIndex)]`: the
 * moved row/column lands at `toIndex`, and every row/column strictly
 * between its old and new position shifts one slot to make room — `arrayMove`,
 * below, computes that permutation once and both `moveRow`/`moveColumn`
 * reuse it identically.
 *
 * **Crossing the header/body boundary reuses the existing header-
 * promotion/demotion shape**, not a new mechanism: `tableRowInsertion.ts`'s
 * own "Insert row above" on the header, and `tableSelectionDeletion.ts`'s
 * own `deleteHeaderRow`, already establish that the header is just "whatever
 * raw text currently occupies row index 0" — the delimiter/alignment row
 * (never part of `getNavigableRows`) always stays exactly where it already
 * is, immediately after index 0, untouched. Whenever the affected range
 * includes index 0, slot 0's own `[from, to)` is rebuilt independently of
 * the rest of the range (the delimiter row physically sits between index 0
 * and index 1 in the source, so they are never textually adjacent);
 * whatever range of body slots (index `>= 1`) also moved *is* textually
 * contiguous with itself and gets one single range replacement, with the
 * original separators between those rows preserved exactly. A range that
 * never touches index 0 needs only the ordinary contiguous-range shape.
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

/** Whether the row at `rowIndex` (into `getNavigableRows`, header included) can move up/down within `navigableRowCount` navigable rows — `false` only at the two physical ends (index `0` can't move up; the last index can't move down). No header-specific restriction: the header is a slot, not a row identity (see this module's own top doc comment) — it's exactly as movable as any other row. The one shared boundary rule the ±1 menu actions (and `TableHandleMenu.tsx`'s own disabled items) are built on; drag has no equivalent check — see this module's own top doc comment. */
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

/** `[from, to)` text for `navigableRows[index]`. */
function rowText(view: EditorView, navigableRows: readonly SyntaxNode[], index: number): string {
  const row = navigableRows[index]!;
  return view.state.sliceDoc(row.from, row.to);
}

/** Rejoins `texts` (one per row in `originalRows`, same length, same order) using each *original* separator already sitting between those rows — never a hand-built `'\n'`, the same "never hand-build what's already in the document" discipline this module has always followed. Only valid when `originalRows` is a textually-contiguous run (no delimiter/alignment row physically sitting between any consecutive pair) — true of any run of body rows (index `>= 1`), never true across the index 0 / index 1 boundary (see `moveRow`'s own header-crossing branch, which never calls this across that gap). */
function joinWithOriginalSeparators(state: EditorState, texts: readonly string[], originalRows: readonly SyntaxNode[]): string {
  let result = texts[0] ?? '';
  for (let i = 0; i < originalRows.length - 1; i++) {
    const separator = state.sliceDoc(originalRows[i]!.to, originalRows[i + 1]!.from);
    result += separator + (texts[i + 1] ?? '');
  }
  return result;
}

/**
 * Moves the row at `fromIndex` to `toIndex` (any distance apart, either
 * direction) — the shared engine behind the ±1 menu actions and the row
 * handle's own drag gesture (see this module's own top doc comment).
 * `false` for an out-of-range index on either side; `fromIndex === toIndex`
 * is a genuine no-op (`true`, no dispatch — nothing to move).
 */
function moveRow(view: EditorView, table: TableInfo, fromIndex: number, toIndex: number): boolean {
  const navigableRows = getNavigableRows(table.node);
  if (fromIndex < 0 || fromIndex >= navigableRows.length || toIndex < 0 || toIndex >= navigableRows.length) {
    return false;
  }
  if (fromIndex === toIndex) {
    return true;
  }

  const lo = Math.min(fromIndex, toIndex);
  const hi = Math.max(fromIndex, toIndex);
  const slots: number[] = [];
  for (let i = lo; i <= hi; i++) {
    slots.push(i);
  }
  // The old row-index now occupying each slot `lo..hi`, in new order.
  const newOrder = arrayMove(slots, fromIndex - lo, toIndex - lo);

  const changes: ChangeSpec[] = [];
  if (lo === 0) {
    // The moved range crosses the header/body boundary — index 0 is never
    // textually adjacent to index 1 (the delimiter row sits between them),
    // so slot 0 is rebuilt independently; whatever body slots (index
    // `1..hi`) also moved *are* mutually contiguous and get one ordinary
    // range replacement (see this module's own top doc comment).
    const header = navigableRows[0]!;
    changes.push({ from: header.from, to: header.to, insert: rowText(view, navigableRows, newOrder[0]!) });
    const bodyTexts = newOrder.slice(1).map((i) => rowText(view, navigableRows, i));
    const bodyOriginalRows = navigableRows.slice(1, hi + 1);
    changes.push({
      from: navigableRows[1]!.from,
      to: navigableRows[hi]!.to,
      insert: joinWithOriginalSeparators(view.state, bodyTexts, bodyOriginalRows),
    });
  } else {
    const texts = newOrder.map((i) => rowText(view, navigableRows, i));
    const originalRows = navigableRows.slice(lo, hi + 1);
    changes.push({ from: navigableRows[lo]!.from, to: navigableRows[hi]!.to, insert: joinWithOriginalSeparators(view.state, texts, originalRows) });
  }

  dispatchMove(view, changes, { kind: 'row', tableFrom: table.from, rowIndex: toIndex });
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
  if (!rowMoveAvailability(getNavigableRows(table.node).length, selection.rowIndex).canMoveUp) {
    return false;
  }
  return moveRow(view, table, selection.rowIndex, selection.rowIndex - 1);
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
  if (!rowMoveAvailability(getNavigableRows(table.node).length, selection.rowIndex).canMoveDown) {
    return false;
  }
  return moveRow(view, table, selection.rowIndex, selection.rowIndex + 1);
}

/**
 * Exported for the row handle's own drag-to-reorder gesture
 * (`tableHandleOverlay.ts`) — moves the selected row directly to `toIndex`
 * in one transaction, reusing the exact same `moveRow` engine the ±1 menu
 * actions use, generalized to any distance (see this module's own top doc
 * comment). Unlike `moveSelectedRowUp`/`moveSelectedRowDown`, this has no
 * adjacency restriction: `toIndex` may be any valid row index, including
 * across the header/body boundary — the same promotion/demotion shape
 * applies uniformly regardless of distance. `false` for a non-`row`
 * selection, a table that can no longer be found, or an out-of-range
 * `toIndex`; `toIndex === selection.rowIndex` is a genuine no-op (`true`,
 * no dispatch).
 */
export function moveSelectedRowToIndex(view: EditorView, selection: TableSelection, toIndex: number): boolean {
  if (selection.kind !== 'row') {
    return false;
  }
  const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return false;
  }
  return moveRow(view, table, selection.rowIndex, toIndex);
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
 * The reorder change for one ordinary (non-alignment) `row`'s own columns
 * `lo..hi` (`newOrder` — the old column index now occupying each slot
 * `lo..hi`, in new order, from `arrayMove`) — `null` when this row has no
 * real column at *every* index in `[lo, hi]`, or is missing an internal
 * delimiter between any two of them (a ragged row shorter than the header,
 * left untouched entirely — exactly the same "preserve ragged rows"
 * reading `columnDeletionChangeForRow`/`columnInsertionChangeForRow`
 * already establish, extended from a pair to a range). Reinserts each
 * column's own raw (untrimmed) text verbatim, permuted, with every
 * delimiter *already at* one of the `hi - lo` internal positions (ordinarily
 * a single `|` each, sliced rather than assumed) left exactly where it
 * already was — preserving padding, alignment-relative formatting, and
 * escaped pipes inside every cell's own content unchanged.
 */
function columnRangeChangeForRow(state: EditorState, row: SyntaxNode, lo: number, hi: number, newOrder: readonly number[]): ChangeSpec | null {
  const columns = getRowColumnSegments(row);
  for (let i = lo; i <= hi; i++) {
    if (!columns[i]) {
      return null;
    }
  }
  for (let i = lo; i < hi; i++) {
    if (!columns[i]!.rightDelimiter) {
      return null;
    }
  }
  const texts = newOrder.map((i) => state.sliceDoc(columns[i]!.rawFrom, columns[i]!.rawTo));
  let insert = texts[0] ?? '';
  for (let i = lo; i < hi; i++) {
    const delimiter = columns[i]!.rightDelimiter!;
    insert += state.sliceDoc(delimiter.from, delimiter.to) + (texts[i - lo + 1] ?? '');
  }
  return { from: columns[lo]!.rawFrom, to: columns[hi]!.rawTo, insert };
}

/** The alignment/delimiter row's own reorder — rebuilt wholesale from its own already-known cell text (`splitPipeRowCells`), the same "single opaque `TableDelimiter`, no per-column child nodes to anchor a sub-range edit on" reasoning `tableColumnInsertion.ts`'s own `alignmentInsertionChange` already documents. Each column's own alignment marker (`:left`/`right:`/`:center:`/plain `---`) travels with it, unchanged; cells outside `[lo, hi]` are untouched. */
function alignmentRangeChange(row: SyntaxNode, rawText: string, lo: number, newOrder: readonly number[]): ChangeSpec {
  const cells = splitPipeRowCells(rawText);
  const next = [...cells];
  for (let i = 0; i < newOrder.length; i++) {
    next[lo + i] = cells[newOrder[i]!] ?? '';
  }
  return { from: row.from, to: row.to, insert: '| ' + next.join(' | ') + ' |' };
}

/**
 * Moves the column at `fromIndex` to `toIndex` (any distance apart, either
 * direction) — the shared engine behind the ±1 menu actions and the column
 * handle's own drag gesture, symmetric to `moveRow`. `false` for an
 * out-of-range index on either side; `fromIndex === toIndex` is a genuine
 * no-op (`true`, no dispatch).
 */
function moveColumn(view: EditorView, table: TableInfo, fromIndex: number, toIndex: number): boolean {
  const navigableRows = getNavigableRows(table.node);
  const header = navigableRows[0];
  if (!header) {
    return false;
  }
  const headerColumnCount = getRowColumnSegments(header).length;
  if (fromIndex < 0 || fromIndex >= headerColumnCount || toIndex < 0 || toIndex >= headerColumnCount) {
    return false;
  }
  if (fromIndex === toIndex) {
    return true;
  }

  const lo = Math.min(fromIndex, toIndex);
  const hi = Math.max(fromIndex, toIndex);
  const slots: number[] = [];
  for (let i = lo; i <= hi; i++) {
    slots.push(i);
  }
  const newOrder = arrayMove(slots, fromIndex - lo, toIndex - lo);

  const changes: ChangeSpec[] = [];
  const headerChange = columnRangeChangeForRow(view.state, header, lo, hi, newOrder);
  if (!headerChange) {
    // The header always has every column, by definition — unreachable given
    // the bounds guard above, declines rather than guessing if it somehow
    // isn't (mirrors `insertColumn`'s/`duplicateColumn`'s own identical
    // defensive shape).
    return false;
  }
  changes.push(headerChange);

  const alignRow = header.nextSibling;
  if (alignRow && isAlignmentRow(alignRow)) {
    changes.push(alignmentRangeChange(alignRow, view.state.sliceDoc(alignRow.from, alignRow.to), lo, newOrder));
  }

  for (const row of navigableRows.slice(1)) {
    const change = columnRangeChangeForRow(view.state, row, lo, hi, newOrder);
    if (change) {
      changes.push(change);
    }
  }

  // Width metadata follows the moved column, in the same transaction —
  // never a second dispatch (see `tableColumnWidthMetadata.ts`'s own
  // "Structural-operation synchronization" section). A `null` attribute
  // (no persisted widths) or `null` change (metadata already at target
  // shape, unreachable here since a real move always permutes a real
  // array) contributes nothing to `changes`, matching every other
  // conditional push in this function.
  const attribute = resolveTableColumnWidths(view.state, table);
  const nextWidths = nextWidthsAfterColumnMove(attribute?.widths ?? null, fromIndex, toIndex);
  const widthsChange = buildTableColumnWidthsAttributeChange(attribute, nextWidths);
  if (widthsChange) {
    changes.push(widthsChange);
  }

  dispatchMove(view, changes, { kind: 'column', tableFrom: table.from, columnIndex: toIndex });
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
  const header = getNavigableRows(table.node)[0];
  const columnCount = header ? getRowColumnSegments(header).length : 0;
  if (!columnMoveAvailability(columnCount, selection.columnIndex).canMoveLeft) {
    return false;
  }
  return moveColumn(view, table, selection.columnIndex, selection.columnIndex - 1);
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
  const header = getNavigableRows(table.node)[0];
  const columnCount = header ? getRowColumnSegments(header).length : 0;
  if (!columnMoveAvailability(columnCount, selection.columnIndex).canMoveRight) {
    return false;
  }
  return moveColumn(view, table, selection.columnIndex, selection.columnIndex + 1);
}

/**
 * Exported for the column handle's own drag-to-reorder gesture
 * (`tableHandleOverlay.ts`) — symmetric to `moveSelectedRowToIndex`: moves
 * the selected column directly to `toIndex` in one transaction, reusing
 * `moveColumn` with no adjacency restriction. `false` for a non-`column`
 * selection, a table that can no longer be found, or an out-of-range
 * `toIndex`; `toIndex === selection.columnIndex` is a genuine no-op (`true`,
 * no dispatch).
 */
export function moveSelectedColumnToIndex(view: EditorView, selection: TableSelection, toIndex: number): boolean {
  if (selection.kind !== 'column') {
    return false;
  }
  const table = findAllTables(view.state).find((t) => t.from === selection.tableFrom);
  if (!table) {
    return false;
  }
  return moveColumn(view, table, selection.columnIndex, toIndex);
}
