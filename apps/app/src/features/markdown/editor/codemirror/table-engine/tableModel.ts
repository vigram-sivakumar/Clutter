import type { SyntaxNode, Tree } from '@lezer/common';
import { buildDelimiterCellText, cellGapWidth, minimumDelimiterGapWidth } from '../table/tableAlignment';
import { padCellContent } from '../table/tableGeometry';

/** Raw Markdown cell contents, not HTML or decoded display strings. */
export type Alignment = 'none' | 'left' | 'center' | 'right';
export interface TableModel {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly alignments: readonly Alignment[];
}
export interface CellSource {
  readonly rawFrom: number;
  readonly rawTo: number;
  readonly from: number;
  readonly to: number;
}
export interface TableSnapshot {
  readonly from: number;
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

/** The engine supports top-level tables. It refuses
 * nested tables instead of rewriting their container syntax. Overflow
 * and ragged rows are projected without losing source cells or editing on read.
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
  return snapshotFromTableNode(source, node);
}

/** Project a node from the root editor's current shared Markdown tree. */
export function snapshotFromTableNode(source: string, node: SyntaxNode): TableSnapshot {
  if (node.name !== 'Table') fail('Expected a table node');
  if (node.parent?.name !== 'Document' || node.from !== lineStart(source, node.from)) {
    fail('Nested/indented tables are unsupported by the table engine');
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
  let width = count;
  for (let row = delimiter.nextSibling; row; row = row.nextSibling) {
    if (row.name !== 'TableRow') fail('Unrecognised table child');
    const found: (CellSource | null)[] = readRow(source, row);
    width = Math.max(width, found.length);
    cells.push(found);
  }
  // Imported overflow rows may contain real Markdown beyond the header.
  // Project every source cell, adding only virtual empty cells and default
  // alignments to the derived model. Reading and editing an existing cell
  // do not rewrite the source. Explicit structural edits (or activation of
  // an absent cell) use the validated serializer to materialise the width.
  while (alignments.length < width) alignments.push('none');
  for (const row of cells) while (row.length < width) row.push(null);
  const textRows = cells.map((row) => row.map((cell) => cell ? source.slice(cell.from, cell.to) : ''));
  // Include trailing whitespace on the table's own final source line, if any.
  const end = lineEnd(source, node.to);
  if (source.slice(node.to, end).trim() !== '') fail('Table has unexpected trailing content');
  const to = end;
  const model: TableModel = { header: textRows[0]!, rows: textRows.slice(1), alignments };
  validateModel(model);
  return { from: node.from, to, source: source.slice(node.from, to), model, cells };
}

/** The single eligibility check for rendering and root interaction guards. */
export function projectableTableSnapshot(source: string, node: SyntaxNode): TableSnapshot | null {
  try { return snapshotFromTableNode(source, node); }
  catch (error) {
    if (!(error instanceof TableEngineError)) throw error;
    return null;
  }
}

export function validateModel(model: TableModel): void {
  const n = model.header.length;
  if (!n || model.rows.some((row) => row.length !== n)) fail('Table must be rectangular');
  if (model.alignments.length !== n || model.alignments.some((a) => !['none', 'left', 'center', 'right'].includes(a))) {
    fail('Invalid alignment count or value');
  }
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
  return lines.join('\n');
}

/** Explicit Format table: align raw source columns with the same width
 * primitives as the existing product formatter. Ordinary edits remain compact. */
export function serializeFormattedTable(model: TableModel): string {
  validateModel(model);
  const rows = [model.header, ...model.rows];
  const alignments = model.alignments.map(a => a === 'none' ? null : a);
  const widths = alignments.map((alignment, col) => rows.reduce(
    (width, row) => Math.max(width, cellGapWidth(row[col]!)), minimumDelimiterGapWidth(alignment)));
  const line = (row: readonly string[]) => '|' + row.map((cell, col) => padCellContent(cell, widths[col]!) + '|').join('');
  const delimiter = '|' + widths.map((width, col) => ' ' + buildDelimiterCellText(alignments[col] ?? null, width) + ' |').join('');
  const lines = [line(model.header), delimiter, ...model.rows.map(line)];
  return lines.join('\n');
}

export function modelsEqual(a: TableModel, b: TableModel): boolean {
  return JSON.stringify([a.header, a.rows, a.alignments]) ===
    JSON.stringify([b.header, b.rows, b.alignments]);
}
