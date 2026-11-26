import {
  modelsEqual, readTable, serializeTable, serializeFormattedTable, TableEngineError, validateModel,
  type Alignment, type ParseMarkdown, type TableModel, type TableSnapshot,
} from './tableModel';

/** Row 0 is the structural header. Inserting at 0 promotes a blank header and demotes the old header to a body row. */
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
  | { readonly kind: 'paste'; readonly row: number; readonly col: number; readonly grid: readonly (readonly string[])[] }
  | { readonly kind: 'materialize' }
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
  const cols = () => alignments.length;
  const blank = () => Array<string>(cols()).fill('');
  function insertColumn(index: number, duplicate?: number): void {
    requireIndex(index, 0, cols());
    if (duplicate !== undefined) requireIndex(duplicate, 0, cols() - 1);
    const alignment = duplicate === undefined ? 'none' : alignments[duplicate]!;
    for (const row of rows) row.splice(index, 0, duplicate === undefined ? '' : row[duplicate]!);
    alignments.splice(index, 0, alignment);

  }
  switch (command.kind) {
    case 'insertRow':
      requireIndex(command.index, 0, rows.length);
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

      break;
    case 'duplicateColumn':
      insertColumn(command.index + 1, command.index);
      break;
    case 'moveColumn':
      requireIndex(command.from, 0, cols() - 1);
      requireIndex(command.to, 0, cols() - 1);
      for (const row of rows) move(row, command.from, command.to);
      move(alignments, command.from, command.to);

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
    case 'materialize':
    case 'format':
      break;
  }
  const next: TableModel = { header: rows[0]!, rows: rows.slice(1), alignments };
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
  if (command.kind === 'materialize' && before.cells.every(row => row.every(cell => cell !== null))) return null;
  if (command.kind !== 'format' && command.kind !== 'materialize' && modelsEqual(before.model, next)) return null;
  const from = before.from;
  const insert = command.kind === 'format' ? serializeFormattedTable(next) : serializeTable(next);
  if (insert === source.slice(from, before.to)) return null;
  const expectedDocument = source.slice(0, from) + insert + source.slice(before.to);
  const after = readTable(expectedDocument, before.from, parse);
  if (after.to !== from + insert.length || !modelsEqual(next, after.model)) {
    throw new TableEngineError('Serialized table failed round-trip validation');
  }
  return { before, after, change: { from, to: before.to, insert }, expectedDocument };
}
