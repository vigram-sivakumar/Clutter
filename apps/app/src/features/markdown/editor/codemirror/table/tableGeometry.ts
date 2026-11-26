import { syntaxTree } from '@codemirror/language';
import type { EditorState, SelectionRange } from '@codemirror/state';
import type { SyntaxNode, Tree } from '@lezer/common';

/** Shared read-only syntax-tree queries and Markdown source padding.
 * Interactive cell addresses, missing cells, structural commands and history
 * belong to the table engine, not this module.
 */
export interface CellBounds {
  readonly leftDelimiterTo: number;
  readonly rightDelimiterFrom: number;
}

export function findEnclosingTable(state: EditorState, pos: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolve(pos, 1);
  while (node && node.name !== 'Table') {
    node = node.parent;
  }
  return node;
}

export interface TableInfo {
  readonly node: SyntaxNode;
  readonly from: number;
  readonly to: number;
}

export function findAllTables(state: EditorState, tree: Tree = syntaxTree(state)): TableInfo[] {
  const tables: TableInfo[] = [];
  tree.iterate({
    enter: (node) => {
      if (node.name === 'Table') {
        tables.push({ node: node.node, from: node.from, to: node.to });
      }
    },
  });
  return tables;
}

export function findTableStartingAt(state: EditorState, pos: number): TableInfo | null {
  const table = findEnclosingTable(state, pos);
  return table && table.from === pos ? { node: table, from: table.from, to: table.to } : null;
}

export function tableIntersectsSelectionRange(range: SelectionRange, table: TableInfo): boolean {
  return !range.empty && range.from < table.to && range.to > table.from;
}

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

export function startOfCellContent(state: EditorState, bounds: CellBounds): number {
  const text = state.sliceDoc(bounds.leftDelimiterTo, bounds.rightDelimiterFrom);
  return bounds.leftDelimiterTo + (text.length - text.trimStart().length);
}

export function findCellIndexAt(rowBounds: readonly CellBounds[], pos: number): number {
  return rowBounds.findIndex((b) => pos >= b.leftDelimiterTo && pos <= b.rightDelimiterFrom);
}

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

export function padCellContent(content: string, minGapWidth: number): string {
  const targetWidth = Math.max(minGapWidth, content.length + 2);
  const trailing = targetWidth - content.length - 1;
  return ' ' + content + ' '.repeat(trailing);
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
