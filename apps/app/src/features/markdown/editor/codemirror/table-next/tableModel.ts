import type { SyntaxNode, Tree } from '@lezer/common';

/** Raw Markdown cell contents, not HTML or decoded display strings. */
export type Alignment = 'none' | 'left' | 'center' | 'right';
export interface TableModel {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly alignments: readonly Alignment[];
  readonly columnWidths: readonly number[] | null;
}
export interface CellSource {
  readonly rawFrom: number;
  readonly rawTo: number;
  readonly from: number;
  readonly to: number;
}
export interface TableSnapshot {
  readonly from: number;
  /** Includes the width attribute when present. */
  readonly to: number;
  readonly source: string;
  readonly model: TableModel;
  /** Header first; null denotes an absent cell in an imported ragged row. */
  readonly cells: readonly (readonly (CellSource | null)[])[];
}
export type ParseMarkdown = (source: string) => Tree;

export class TableEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TableEngineError';
  }
}

function fail(message: string): never {
  throw new TableEngineError(message);
}
function lineStart(source: string, pos: number): number {
  return pos === 0 ? 0 : source.lastIndexOf('\n', pos - 1) + 1;
}
function lineEnd(source: string, pos: number): number {
  const next = source.indexOf('\n', pos);
  return next === -1 ? source.length : next;
}

/** Use only the shared grammar's direct delimiter children for real rows.
 * Escapes, inline markup and optional outer pipes are decided by that grammar.
 * No second regex-based interpretation of cell boundaries.
 */
function readRow(source: string, row: SyntaxNode): CellSource[] {
  const pipes: SyntaxNode[] = [];
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name === 'TableDelimiter') pipes.push(child);
  }
  const raw: { from: number; to: number }[] = [];
  const first = pipes[0];
  const last = pipes[pipes.length - 1];
  if (!first || !last) {
    raw.push({ from: row.from, to: row.to });
  } else {
    if (source.slice(row.from, first.from).trim() !== '') raw.push({ from: row.from, to: first.from });
    for (let i = 1; i < pipes.length; i++) {
      raw.push({ from: pipes[i - 1]!.to, to: pipes[i]!.from });
    }
    if (source.slice(last.to, row.to).trim() !== '') raw.push({ from: last.to, to: row.to });
  }
  return raw.map(({ from, to }) => {
    const text = source.slice(from, to);
    const trimmed = text.trim();
    const contentFrom = from + text.length - text.trimStart().length;
    return {
      rawFrom: from,
      rawTo: to,
      from: trimmed === '' ? from : contentFrom,
      to: trimmed === '' ? from : contentFrom + trimmed.length,
    };
  });
}

/** The alignment row is a single opaque grammar node. Its grammar admits
 * only colons, dashes, spaces and delimiter pipes (never cell Markdown).
 */
function readAlignments(source: string): Alignment[] {
  return source.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((part) => {
    const cell = part.trim();
    if (!/^:?-+:?$/.test(cell)) fail('Invalid alignment row');
    return cell.startsWith(':') ? (cell.endsWith(':') ? 'center' : 'left') : (cell.endsWith(':') ? 'right' : 'none');
  });
}

function readWidths(line: string, count: number): readonly number[] | null {
  if (!line.trim().startsWith('{table-col-widths')) return null;
  const match = /^\{table-col-widths="(\d+(?:\s*,\s*\d+)*)"\}$/.exec(line.trim());
  if (!match) fail('Malformed width metadata: preserve source instead of guessing');
  const values = match[1]!.split(',').map(Number);
  if (values.length !== count || values.some((n) => !Number.isSafeInteger(n) || n <= 0)) {
    fail('Width metadata does not match columns');
  }
  return values;
}

/** Initial prototype deliberately supports top-level tables only. It refuses
 * nested or overflowing rows instead of silently discarding source content.
 * Parsing does not modify the document, including ragged rows.
 */
export function readTable(source: string, tableFrom: number, parse: ParseMarkdown): TableSnapshot {
  const tree = parse(source);
  const matches: SyntaxNode[] = [];
  tree.iterate({ enter(node) {
    if (node.name === 'Table' && node.from === tableFrom) {
      matches.push(node.node);
      return false;
    }
  } });
  const node = matches[0];
  if (!node) fail('No table at requested source position');
  if (node.parent?.name !== 'Document' || node.from !== lineStart(source, node.from)) {
    fail('Nested/indented tables are outside the first prototype');
  }
  const header = node.firstChild;
  const delimiter = header?.nextSibling;
  if (!header || header.name !== 'TableHeader' || !delimiter || delimiter.name !== 'TableDelimiter') {
    fail('Invalid table structure');
  }
  const headerCells = readRow(source, header);
  const count = headerCells.length;
  if (!count) fail('Table has no columns');
  const alignments = readAlignments(source.slice(delimiter.from, delimiter.to));
  if (alignments.length !== count) fail('Header and delimiter disagree');
  const cells: (CellSource | null)[][] = [headerCells];
  for (let row = delimiter.nextSibling; row; row = row.nextSibling) {
    if (row.name !== 'TableRow') fail('Unrecognised table child');
    const found: (CellSource | null)[] = readRow(source, row);
    if (found.length > count) fail('Overflow cells must not be discarded');
    while (found.length < count) found.push(null);
    cells.push(found);
  }
  const textRows = cells.map((row) => row.map((cell) => cell ? source.slice(cell.from, cell.to) : ''));
  // Include trailing whitespace on the table's own final source line, if any.
  const end = lineEnd(source, node.to);
  if (source.slice(node.to, end).trim() !== '') fail('Table has unexpected trailing content');
  let to = end;
  let widths: readonly number[] | null = null;
  if (end < source.length) {
    const attributeEnd = lineEnd(source, end + 1);
    widths = readWidths(source.slice(end + 1, attributeEnd), count);
    if (widths !== null) to = attributeEnd;
  }
  const model: TableModel = { header: textRows[0]!, rows: textRows.slice(1), alignments, columnWidths: widths };
  validateModel(model);
  return { from: node.from, to, source: source.slice(node.from, to), model, cells };
}

export function validateModel(model: TableModel): void {
  const n = model.header.length;
  if (!n || model.rows.some((row) => row.length !== n)) fail('Table must be rectangular');
  if (model.alignments.length !== n || model.alignments.some((a) => !['none', 'left', 'center', 'right'].includes(a))) {
    fail('Invalid alignment count or value');
  }
  if (model.columnWidths !== null && (model.columnWidths.length !== n ||
    model.columnWidths.some((w) => !Number.isSafeInteger(w) || w <= 0))) fail('Invalid widths');
  for (const row of [model.header, ...model.rows]) {
    for (const cell of row) {
      if (typeof cell !== 'string' || /[\r\n]/.test(cell) || cell.trim() !== cell) fail('Cell must be trimmed single-line Markdown');
    }
  }
}

/** Compact, deterministic source. Pixel widths are not Markdown padding. */
export function serializeTable(model: TableModel): string {
  validateModel(model);
  const row = (cells: readonly string[]) => '| ' + cells.join(' | ') + ' |';
  const delimiter = model.alignments.map((a) => a === 'center' ? ':---:' : a === 'left' ? ':---' : a === 'right' ? '---:' : '---');
  const lines = [row(model.header), row(delimiter), ...model.rows.map(row)];
  if (model.columnWidths !== null) lines.push('{table-col-widths="' + model.columnWidths.join(',') + '"}');
  return lines.join('\n');
}

export function modelsEqual(a: TableModel, b: TableModel): boolean {
  return JSON.stringify([a.header, a.rows, a.alignments, a.columnWidths]) ===
    JSON.stringify([b.header, b.rows, b.alignments, b.columnWidths]);
}
