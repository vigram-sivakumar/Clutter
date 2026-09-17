import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

/**
 * Shared table syntax-tree/geometry primitives, extracted from
 * `tableDeletionGuard.ts` (Step 1) so `tableArrowKeymap.ts` (Step 2) reuses
 * the exact same tree-walking rather than re-deriving a parallel notion of
 * "which cell/row is this position in" — see docs/editor-architecture-
 * decisions.md's table-investigation entries for the fuller rationale
 * behind delimiter-position-based (not `TableCell`-node-based) addressing.
 * Purely read-only queries over the syntax tree; no state of their own.
 */

export function findEnclosingTable(state: EditorState, pos: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolve(pos, 1);
  while (node && node.name !== 'Table') {
    node = node.parent;
  }
  return node;
}

/** The `TableHeader`/`TableRow`/alignment-row (`TableDelimiter` as a direct child of `Table`) containing `pos`, mirroring `tableDecoration.ts`'s own `decorateTable` traversal of a table's direct children. */
export function findEnclosingRow(table: SyntaxNode, pos: number): SyntaxNode | null {
  const header = table.firstChild;
  if (!header || header.name !== 'TableHeader') {
    return null;
  }
  if (pos >= header.from && pos <= header.to) {
    return header;
  }
  const alignRow = header.nextSibling;
  if (!alignRow || alignRow.name !== 'TableDelimiter') {
    return null;
  }
  if (pos >= alignRow.from && pos <= alignRow.to) {
    return alignRow;
  }
  for (let row = alignRow.nextSibling; row; row = row.nextSibling) {
    if (row.name === 'TableRow' && pos >= row.from && pos <= row.to) {
      return row;
    }
  }
  return null;
}

export interface CellBounds {
  readonly leftDelimiterTo: number;
  readonly rightDelimiterFrom: number;
}

/** The column-gap `[leftDelimiter.to, rightDelimiter.from)` containing `pos`, or `null` if `pos` isn't between two `TableDelimiter` children of `row` (i.e. it's at the row's own leading/trailing edge, or `row` has no delimiter children at all — true of the alignment row, which is one opaque leaf `TableDelimiter`). Works identically for a populated or a fully empty cell, since it never consults `TableCell`. */
export function findEnclosingCellBounds(row: SyntaxNode, pos: number): CellBounds | null {
  let prevDelimiterTo: number | null = null;
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'TableDelimiter') {
      continue;
    }
    if (prevDelimiterTo !== null && pos >= prevDelimiterTo && pos <= child.from) {
      return { leftDelimiterTo: prevDelimiterTo, rightDelimiterFrom: child.from };
    }
    prevDelimiterTo = child.to;
  }
  return null;
}

/** Every column's bounds in `row`, left to right — the array form of `findEnclosingCellBounds`, needed by Step 2 to find the cell before or after a given one (not just the one containing a position). Empty for the alignment row (no delimiter children to pair up), which is exactly the desired "no cells to navigate between" outcome there — no special-casing needed. */
export function getRowCellBounds(row: SyntaxNode): CellBounds[] {
  const bounds: CellBounds[] = [];
  let prevDelimiterTo: number | null = null;
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'TableDelimiter') {
      continue;
    }
    if (prevDelimiterTo !== null) {
      bounds.push({ leftDelimiterTo: prevDelimiterTo, rightDelimiterFrom: child.from });
    }
    prevDelimiterTo = child.to;
  }
  return bounds;
}

/** The alignment/delimiter row (`| --- | ---: |`) is a single opaque `TableDelimiter` node — see `tableAlignment.ts`'s own doc comment — never a `TableHeader`/`TableRow`. */
export function isAlignmentRow(row: SyntaxNode): boolean {
  return row.name === 'TableDelimiter';
}

/** `pos` counts as "at the start" of `bounds` when only whitespace (or nothing) separates it from the cell's own left delimiter — not a bare `pos === leftDelimiterTo` equality, so a real space between `|` and the cell's text (`| Vik`) is still "the beginning of the cell" by the frozen UX's own wording. Also correctly covers a fully empty cell (the whole gap is blank, so every position in it counts as both start and end). */
export function isAtCellStart(state: EditorState, bounds: CellBounds, pos: number): boolean {
  return state.sliceDoc(bounds.leftDelimiterTo, pos).trim() === '';
}

/** Symmetric to `isAtCellStart`, from the right delimiter. */
export function isAtCellEnd(state: EditorState, bounds: CellBounds, pos: number): boolean {
  return state.sliceDoc(pos, bounds.rightDelimiterFrom).trim() === '';
}

/** The position right after any leading whitespace in `bounds` — i.e. where real content starts, or `bounds.rightDelimiterFrom` if the cell is empty/all-whitespace (there's no real content to land before). */
export function startOfCellContent(state: EditorState, bounds: CellBounds): number {
  const text = state.sliceDoc(bounds.leftDelimiterTo, bounds.rightDelimiterFrom);
  return bounds.leftDelimiterTo + (text.length - text.trimStart().length);
}

/** Symmetric to `startOfCellContent`: the position right before any trailing whitespace, or `bounds.leftDelimiterTo` if the cell is empty/all-whitespace. */
export function endOfCellContent(state: EditorState, bounds: CellBounds): number {
  const text = state.sliceDoc(bounds.leftDelimiterTo, bounds.rightDelimiterFrom);
  return bounds.rightDelimiterFrom - (text.length - text.trimEnd().length);
}

/** Shared precondition for every table keymap guard: a collapsed caret, in an editable view, actually inside a table row. Bails (`null`) the instant any of that isn't true, so the overwhelming common case (no table nearby) is as cheap as one failed tree-resolve. `table` is included alongside `row`/`pos` (Step 3 needs it, to read the header's own canonical column count) — purely additive over Steps 1/2's own destructuring of just `{ row, pos }`, so this doesn't change their behavior. */
export function resolveTableRowAtCursor(view: EditorView): { table: SyntaxNode; row: SyntaxNode; pos: number } | null {
  const { state } = view;
  if (state.readOnly) {
    return null;
  }
  const range = state.selection.main;
  if (!range.empty) {
    return null;
  }
  const pos = range.head;
  const table = findEnclosingTable(state, pos);
  if (!table) {
    return null;
  }
  const row = findEnclosingRow(table, pos);
  if (!row) {
    return null;
  }
  return { table, row, pos };
}

/** The index into `getRowCellBounds(row)` whose gap contains `pos`, or `-1` if `pos` isn't inside any column of `row` (its own leading/trailing edge, or a row — like the alignment row — with no columns at all). Shared by Step 2 (find the neighboring cell) and Step 3 (find which column to recreate in the new row). */
export function findCellIndexAt(rowBounds: readonly CellBounds[], pos: number): number {
  return rowBounds.findIndex((b) => pos >= b.leftDelimiterTo && pos <= b.rightDelimiterFrom);
}

/** Every row a user can actually navigate/edit cells in, in row-major document order: the header, then every `TableRow` — the alignment row is never included (it has no cells, per `getRowCellBounds`). Shared by Step 3 (decide whether Enter fired in the header) and Step 4 (flatten the whole table into one row-major cell sequence for Tab/Shift-Tab). */
export function getNavigableRows(table: SyntaxNode): SyntaxNode[] {
  const header = table.firstChild;
  if (!header || header.name !== 'TableHeader') {
    return [];
  }
  const rows: SyntaxNode[] = [header];
  const alignRow = header.nextSibling;
  if (!alignRow || alignRow.name !== 'TableDelimiter') {
    return rows;
  }
  for (let row = alignRow.nextSibling; row; row = row.nextSibling) {
    if (row.name === 'TableRow') {
      rows.push(row);
    }
  }
  return rows;
}

/** Raw Markdown text for a brand-new, fully empty row with `columnCount` columns — e.g. `| | |` for two columns. */
export function buildEmptyRowText(columnCount: number): string {
  return '|' + ' |'.repeat(columnCount);
}

/** The position, local to a string built by `buildEmptyRowText`, that sits inside column `columnIndex`'s own (single-space, empty) cell. */
export function emptyRowCellOffset(columnIndex: number): number {
  return columnIndex * 2 + 1;
}

/**
 * Where a brand-new row should be inserted immediately after `row` (the
 * table's own header or one of its `TableRow`s) — or `null` if `row` isn't
 * a valid target (the alignment row itself, or a malformed table with no
 * delimiter row). For a `TableRow`, this is simply the row's own `.to`.
 * For the header, it is deliberately the delimiter/alignment row's own
 * `.to`, **not** the header's own `.to` — GFM requires the delimiter row
 * to be the header's very next line, so inserting directly after the
 * header would immediately invalidate the table (the same class of
 * corruption Step 1 exists to prevent, reached from a different key).
 * Shared by Step 3 (Enter in the header) and Step 4 (Tab creating a new
 * row when the header is the table's only navigable row).
 */
export function insertRowAfterPosition(row: SyntaxNode): number | null {
  if (row.name === 'TableRow') {
    return row.to;
  }
  if (row.name === 'TableHeader') {
    const alignRow = row.nextSibling;
    if (!alignRow || alignRow.name !== 'TableDelimiter') {
      return null;
    }
    return alignRow.to;
  }
  return null;
}

export interface LogicalCell {
  readonly table: SyntaxNode;
  readonly row: SyntaxNode;
  /** Index into `getNavigableRows(table)` — the table's own logical row number. The alignment row can never produce a `LogicalCell` at all (see below), so this is always a real header/data row. */
  readonly rowIndex: number;
  /** Index into `getRowCellBounds(row)` — the table's own logical column number. */
  readonly columnIndex: number;
  readonly bounds: CellBounds;
}

/**
 * Resolves a document position to its logical `(rowIndex, columnIndex)`
 * table coordinate — the invariant every table interaction (Steps 2–5 so
 * far) is built on. This is deliberately syntax-tree-only: it never reads
 * a pixel position, a rendered layout, or anything from `EditorView` —
 * only `EditorState` and the parse tree. That's what keeps table
 * interaction semantics stable across a rendering change: today the table
 * is unrendered raw Markdown (no CSS-table layout wired in yet); once
 * `tableDecoration()` is wired in, or replaced by any future rendering
 * approach, this function's contract — and everything built on it — does
 * not need to change, because it was never coupled to how the table
 * *looks* in the first place.
 *
 * Returns `null` when `pos` isn't inside a table at all, or isn't
 * resolvable to one specific cell — the alignment row (never a valid
 * `LogicalCell`: it has no columns, per `getRowCellBounds`, so it can
 * never be assigned a `rowIndex` either) or a row's own leading/trailing
 * edge outside any cell.
 */
export function resolveLogicalCell(state: EditorState, pos: number): LogicalCell | null {
  const table = findEnclosingTable(state, pos);
  if (!table) {
    return null;
  }
  const row = findEnclosingRow(table, pos);
  if (!row) {
    return null;
  }
  const navigableRows = getNavigableRows(table);
  const rowIndex = navigableRows.findIndex((r) => r.from === row.from);
  if (rowIndex === -1) {
    return null;
  }
  const rowBounds = getRowCellBounds(row);
  const columnIndex = findCellIndexAt(rowBounds, pos);
  const bounds = rowBounds[columnIndex];
  if (!bounds) {
    return null;
  }
  return { table, row, rowIndex, columnIndex, bounds };
}

/**
 * The inverse of `resolveLogicalCell`: given a table and a logical
 * `(rowIndex, columnIndex)` coordinate, returns that cell's own row and
 * bounds. `columnIndex` is clamped to the target row's own last available
 * column when that row is ragged (GFM tolerates a row with fewer cells
 * than the header) — every real row has at least one column, so this
 * only ever returns `null` when `rowIndex` itself is out of range.
 */
export function resolveCellAt(table: SyntaxNode, rowIndex: number, columnIndex: number): { row: SyntaxNode; bounds: CellBounds } | null {
  const row = getNavigableRows(table)[rowIndex];
  if (!row) {
    return null;
  }
  const rowBounds = getRowCellBounds(row);
  const bounds = rowBounds[Math.min(columnIndex, rowBounds.length - 1)];
  if (!bounds) {
    return null;
  }
  return { row, bounds };
}

/**
 * Whether Backspace at `pos` would delete the newline separating some
 * `Table` from whatever follows it (a freshly-created blank line, an
 * existing paragraph, …), merging them into the table. That newline sits
 * at document position `pos - 1` (Backspace deletes `sliceDoc(pos - 1,
 * pos)`) — confirmed empirically against the installed parser: a table's
 * own `.to` never extends to include its trailing newline (nor, for a
 * table ending at the very end of the document, is a lone final newline
 * absorbed into it either), so the check must resolve the tree at `pos -
 * 1` — a position genuinely inside/at the table's own range — not at
 * `pos` itself, which sits one character *outside* it; resolving at `pos`
 * and walking up parents could never reach a *sibling* `Table` node, only
 * ancestors of whatever block starts after it.
 *
 * Deliberately independent of `resolveTableRowAtCursor`/`findEnclosingTable`:
 * the caret here is *outside* the table entirely, not inside one of its
 * rows, which is exactly why the table's own row/cell boundary checks
 * never catch this — confirmed as a real, reproducible bug: one Backspace
 * press from the empty line immediately below a table deleted that line
 * outright, landing the caret back inside the table's own last cell with
 * no protection engaged at any point.
 */
export function isImmediatelyAfterTable(state: EditorState, pos: number): boolean {
  if (pos < 1) {
    return false;
  }
  let node: SyntaxNode | null = syntaxTree(state).resolve(pos - 1, -1);
  while (node) {
    if (node.name === 'Table' && node.to === pos - 1) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

/**
 * Symmetric to `isImmediatelyAfterTable`: whether Delete at `pos` would
 * delete the newline separating whatever precedes some `Table` from its
 * own first (header) line — that newline sits at `pos` itself (Delete
 * deletes `sliceDoc(pos, pos + 1)`), and the table's own `.from` is one
 * past it, at `pos + 1` — so this resolves the tree at `pos + 1` (inside
 * the table's own range), not at `pos`.
 */
export function isImmediatelyBeforeTable(state: EditorState, pos: number): boolean {
  if (pos >= state.doc.length) {
    return false;
  }
  let node: SyntaxNode | null = syntaxTree(state).resolve(pos + 1, 1);
  while (node) {
    if (node.name === 'Table' && node.from === pos + 1) {
      return true;
    }
    node = node.parent;
  }
  return false;
}
