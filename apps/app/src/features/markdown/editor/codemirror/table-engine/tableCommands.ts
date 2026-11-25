import {
  modelsEqual, readTable, serializeTable, TableEngineError, validateModel,
  type Alignment, type ParseMarkdown, type TableModel, type TableSnapshot,
} from './tableModel';

import { DEFAULT_TABLE_COLUMN_WIDTH, MIN_TABLE_COLUMN_WIDTH } from '../table/tableColumnWidthMetadata';

/** Row 0 is the structural header. Insert-row indices start at 1. */
export type TableCommand =
  | { readonly kind: 'insertRow'; readonly index: number }
  | { readonly kind: 'deleteRow'; readonly index: number }
  | { readonly kind: 'duplicateRow'; readonly index: number }
  | { readonly kind: 'moveRow'; readonly from: number; readonly to: number }
  | { readonly kind: 'insertColumn'; readonly index: number }
  | { readonly kind: 'deleteColumn'; readonly index: number }
  | { readonly kind: 'duplicateColumn'; readonly index: number }
  | { readonly kind: 'moveColumn'; readonly from: number; readonly to: number }
  | { readonly kind: 'setCell'; readonly row: number; readonly col: number; readonly markdown: string }
  | { readonly kind: 'setAlignment'; readonly col: number; readonly alignment: Alignment }
  | { readonly kind: 'resizeColumn'; readonly col: number; readonly width: number }
  | { readonly kind: 'paste'; readonly row: number; readonly col: number; readonly grid: readonly (readonly string[])[] }
  | { readonly kind: 'format' };

function requireIndex(value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new TableEngineError('Invalid table index');
}
function move<T>(items: T[], from: number, to: number): void {
  requireIndex(from, 0, items.length - 1);
  requireIndex(to, 0, items.length - 1);
  items.splice(to, 0, items.splice(from, 1)[0]!);
}

/** Pure command reducer: no DOM, selection, CodeMirror or disk access.
 * All column-indexed state changes in the same operation.
 */
export function applyTableCommand(model: TableModel, command: TableCommand): TableModel {
  validateModel(model);
  const rows = [model.header.slice(), ...model.rows.map((row) => row.slice())];
  const alignments = model.alignments.slice();
  let widths = model.columnWidths?.slice() ?? null;
  const cols = () => alignments.length;
  const blank = () => Array<string>(cols()).fill('');
  function insertColumn(index: number, duplicate?: number): void {
    requireIndex(index, 0, cols());
    if (duplicate !== undefined) requireIndex(duplicate, 0, cols() - 1);
    const alignment = duplicate === undefined ? 'none' : alignments[duplicate]!;
    const width = duplicate === undefined ? DEFAULT_TABLE_COLUMN_WIDTH : widths?.[duplicate] ?? DEFAULT_TABLE_COLUMN_WIDTH;
    for (const row of rows) row.splice(index, 0, duplicate === undefined ? '' : row[duplicate]!);
    alignments.splice(index, 0, alignment);
    widths?.splice(index, 0, width);
  }
  switch (command.kind) {
    case 'insertRow':
      requireIndex(command.index, 1, rows.length);
      rows.splice(command.index, 0, blank());
      break;
    case 'deleteRow':
      requireIndex(command.index, 0, rows.length - 1);
      if (rows.length === 1) throw new TableEngineError('Use an explicit whole-table removal command');
      rows.splice(command.index, 1);
      break;
    case 'duplicateRow':
      requireIndex(command.index, 0, rows.length - 1);
      rows.splice(command.index + 1, 0, rows[command.index]!.slice());
      break;
    case 'moveRow':
      move(rows, command.from, command.to);
      break;
    case 'insertColumn':
      insertColumn(command.index);
      break;
    case 'deleteColumn':
      requireIndex(command.index, 0, cols() - 1);
      if (cols() === 1) throw new TableEngineError('Use an explicit whole-table removal command');
      for (const row of rows) row.splice(command.index, 1);
      alignments.splice(command.index, 1);
      widths?.splice(command.index, 1);
      break;
    case 'duplicateColumn':
      insertColumn(command.index + 1, command.index);
      break;
    case 'moveColumn':
      requireIndex(command.from, 0, cols() - 1);
      requireIndex(command.to, 0, cols() - 1);
      for (const row of rows) move(row, command.from, command.to);
      move(alignments, command.from, command.to);
      if (widths) move(widths, command.from, command.to);
      break;
    case 'setCell':
      requireIndex(command.row, 0, rows.length - 1);
      requireIndex(command.col, 0, cols() - 1);
      rows[command.row]![command.col] = command.markdown.trim();
      break;
    case 'setAlignment':
      requireIndex(command.col, 0, cols() - 1);
      alignments[command.col] = command.alignment;
      break;
    case 'resizeColumn':
      requireIndex(command.col, 0, cols() - 1);
      if (!Number.isSafeInteger(command.width) || command.width < MIN_TABLE_COLUMN_WIDTH) throw new TableEngineError('Invalid resize width');
      widths ??= Array<number>(cols()).fill(DEFAULT_TABLE_COLUMN_WIDTH);
      widths[command.col] = command.width;
      break;
    case 'paste': {
      requireIndex(command.row, 0, rows.length - 1);
      requireIndex(command.col, 0, cols() - 1);
      const count = command.grid[0]?.length ?? 0;
      if (!count || command.grid.some((row) => row.length !== count)) throw new TableEngineError('Paste must be a nonempty rectangular grid');
      while (cols() < command.col + count) insertColumn(cols());
      while (rows.length < command.row + command.grid.length) rows.push(blank());
      command.grid.forEach((row, r) => row.forEach((cell, c) => {
        rows[command.row + r]![command.col + c] = cell.trim();
      }));
      break;
    }
    case 'format':
      break;
  }
  const next: TableModel = { header: rows[0]!, rows: rows.slice(1), alignments, columnWidths: widths };
  validateModel(next);
  return next;
}

export interface TableEdit {
  readonly before: TableSnapshot;
  readonly after: TableSnapshot;
  readonly change: { readonly from: number; readonly to: number; readonly insert: string };
  readonly expectedDocument: string;
}

/** One preflight gate for all model commands. Reparse the FULL prospective
 * Markdown, not an isolated row, to detect accidental structure changes.
 * Never dispatch a change when the parser cannot recover the intended model.
 */
export function planTableEdit(source: string, tableFrom: number, command: TableCommand, parse: ParseMarkdown): TableEdit | null {
  const before = readTable(source, tableFrom, parse);
  const next = applyTableCommand(before.model, command);
  if (command.kind !== 'format' && modelsEqual(before.model, next)) return null;
  const insert = serializeTable(next);
  if (insert === before.source) return null;
  const expectedDocument = source.slice(0, before.from) + insert + source.slice(before.to);
  const after = readTable(expectedDocument, before.from, parse);
  if (after.to !== before.from + insert.length || !modelsEqual(next, after.model)) {
    throw new TableEngineError('Serialized table failed round-trip validation');
  }
  return { before, after, change: { from: before.from, to: before.to, insert }, expectedDocument };
}
