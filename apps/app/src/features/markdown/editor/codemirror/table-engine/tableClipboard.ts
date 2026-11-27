import { selectionBounds, type TableInteraction } from './tableInteraction';
import { TableEngineError, type TableModel } from './tableModel';
import type { TableCommand } from './tableCommands';
import { encodeWikiLinkTableSource } from '@core/vault/ingest/grammar/wikiLinkScanner';
import { hasRichHtml, htmlToPieces } from '../paste/htmlToMarkdown';
import { isBlockMarkdown } from '../paste/externalPaste';

/** Clutter's current raw-Markdown clipboard format. */
export const TABLE_MIME = 'application/x-clutter-table';
export type Grid = readonly (readonly string[])[];
type ClipboardReader = Pick<DataTransfer, 'getData'>;
type ClipboardWriter = Pick<DataTransfer, 'setData'>;
const MAX_CELLS = 100_000;

export function selectedGrid(model: TableModel, interaction: TableInteraction): string[][] | null {
  const rows = [model.header, ...model.rows];
  const bounds = selectionBounds(interaction, { rows: rows.length, cols: model.header.length });
  if (!bounds) return null;
  return rows.slice(bounds.top, bounds.bottom + 1).map(row => row.slice(bounds.left, bounds.right + 1));
}

export function clearSelectedCommand(model: TableModel, interaction: TableInteraction): TableCommand | null {
  const bounds = selectionBounds(interaction, { rows: model.rows.length + 1, cols: model.header.length });
  if (!bounds) return null;
  return { kind: 'paste', row: bounds.top, col: bounds.left,
    grid: Array.from({ length: bounds.bottom - bounds.top + 1 }, () => Array<string>(bounds.right - bounds.left + 1).fill('')) };
}

function checkSize(rows: number, cols: number): void {
  if (rows < 1 || cols < 1 || rows * cols > MAX_CELLS) throw new TableEngineError('Invalid or oversized clipboard grid');
}

function rectangular(raw: unknown): string[][] {
  if (!Array.isArray(raw) || !raw.every(row => Array.isArray(row) && row.every(cell => typeof cell === 'string'))) {
    throw new TableEngineError('Malformed clipboard grid');
  }
  const rows = raw as string[][];
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  checkSize(rows.length, width);
  return rows.map(row => Array.from({ length: width }, (_, col) => row[col] ?? ''));
}

/** Escape only unescaped pipes; keep existing Markdown escapes intact.
 * Embedded line breaks become spaces per the single-line cell contract.
 */
export function externalCell(text: string, trim = true): string {
  const escaped = text.replace(/\r\n?|\n/g, ' ').replace(/(\\*)\|/g,
    (_match, slash: string) => slash + (slash.length % 2 === 0 ? '\\|' : '|'));
  return trim ? escaped.trim() : escaped;
}

/** A scalar paste can preserve the same inline Markdown the prose HTML
 * converter produces. Accept only a single, single-line Markdown piece:
 * images, blocks and multiple paragraphs retain the existing plain-text
 * fallback. New converter output is logical Markdown, not already escaped
 * table source. Existing external plain text keeps its odd/even contract.
 * Grid classification always runs before this scalar path.
 */
export function readScalarCell(data: ClipboardReader, trim = true): { source: 'html' | 'text'; markdown: string } | null {
  const html = data.getData('text/html');
  if (html && hasRichHtml(html)) {
    const pieces = htmlToPieces(html);
    const piece = pieces[0];
    if (pieces.length === 1 && piece?.kind === 'markdown' && piece.text &&
        !/[\r\n]/.test(piece.text) && !isBlockMarkdown(piece.text)) {
      return { source: 'html', markdown: encodeWikiLinkTableSource(piece.text) };
    }
  }
  const text = data.getData('text/plain');
  return text !== '' ? { source: 'text', markdown: externalCell(text, trim) } : null;
}

/** Quoted spreadsheet TSV. Preserve empty edge cells and quoted tabs/newlines;
 * a final record separator is not an extra row.
 */
export function parseTsv(text: string): string[][] {
  const input = text.replace(/\r\n?/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  let closed = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') { value += '"'; i++; }
        else { quoted = false; closed = true; }
      } else value += ch;
    } else if (ch === '\t' || ch === '\n') {
      row.push(value); value = ''; closed = false;
      if (ch === '\n') { rows.push(row); row = []; }
    } else if (ch === '"' && value === '' && !closed) quoted = true;
    else {
      if (closed) throw new TableEngineError('Malformed quoted TSV field');
      value += ch;
    }
  }
  if (quoted) throw new TableEngineError('Unclosed quoted TSV field');
  if (row.length || value !== '' || closed || !input.endsWith('\n')) {
    row.push(value); rows.push(row);
  }
  return rectangular(rows);
}

function tsvField(value: string): string {
  return /["\t\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}
export function toTsv(grid: Grid): string {
  return grid.map(row => row.map(tsvField).join('\t')).join('\n');
}

/** HTML may be supplied by an existing sanitized inline renderer. No raw
 * clipboard HTML is ever attached to the live document. */
export function writeGrid(data: ClipboardWriter, grid: Grid, renderCell: (markdown: string) => string): void {
  data.setData('text/plain', toTsv(grid));
  data.setData('text/html', '<table>' + grid.map(row => '<tr>' + row.map(cell => '<td>' + renderCell(cell) + '</td>').join('') + '</tr>').join('') + '</table>');
  data.setData(TABLE_MIME, JSON.stringify({ kind: 'clutter-table-range', rows: grid }));
}

/** A standalone simple HTML table, not arbitrary rich text containing a
 * table. Reject merged cells and surrounding content instead of losing it.
 */
export function readHtmlGrid(html: string): string[][] | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = doc.body.querySelectorAll('table');
  if (tables.length !== 1) return null;
  const table = tables[0]!;
  if (table.querySelector('table, ul, ol, pre, blockquote, img, svg, iframe, object, input, video, audio, hr, h1, h2, h3, h4, h5, h6')) return null;
  for (let node: Node = table; node !== doc.body;) {
    const parent = node.parentNode;
    if (!parent) return null;
    for (const sibling of Array.from(parent.childNodes)) {
      if (sibling === node || sibling.nodeType === 8) continue;
      if (sibling instanceof Element && sibling.matches('style, meta, script, link, template')) continue;
      if ((sibling.textContent ?? '').trim() || (sibling instanceof Element && sibling.matches('img, svg, hr, iframe, input, video, audio'))) return null;
      if (sibling instanceof Element && sibling.querySelector('img, svg, hr, iframe, input, video, audio')) return null;
    }
    node = parent;
  }
  const rows = Array.from(table.rows).map(row => Array.from(row.cells));
  if (rows.some(row => row.some(cell => cell.colSpan !== 1 || cell.rowSpan !== 1))) {
    throw new TableEngineError('Merged spreadsheet cells are not supported');
  }
  return rectangular(rows.map(row => row.map(cell => cell.textContent ?? '')));
}

/** Internal Markdown first; then standalone HTML; then actual TSV.
 * In selected-cell mode plain non-tabular text is a scalar, never guessed
 * into multiple rows. Active text editing retains normal single-text paste.
 */
export interface ClipboardGrid {
  readonly source: 'internal' | 'html' | 'text';
  readonly grid: string[][];
}

/** Root paste excludes indented blocks and mixed prose from spreadsheet detection. */
function rootTabularText(text: string): boolean {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  return lines.every(line => line.includes('\t')) && !lines.every(line => line.startsWith('\t'));
}

export function readClipboardGrid(data: ClipboardReader, allowScalar: boolean, root = false): ClipboardGrid | null {
  const internal = data.getData(TABLE_MIME);
  if (internal) {
    let parsed: unknown;
    try { parsed = JSON.parse(internal); } catch { throw new TableEngineError('Malformed Clutter clipboard'); }
    if (!parsed || typeof parsed !== 'object' || !('kind' in parsed) || parsed.kind !== 'clutter-table-range' || !('rows' in parsed)) {
      throw new TableEngineError('Malformed Clutter clipboard');
    }
    const grid = rectangular(parsed.rows);
    if (grid.some(row => row.some(cell => /[\r\n]/.test(cell)))) throw new TableEngineError('Invalid multiline Markdown clipboard cell');
    return { source: 'internal', grid };
  }
  const html = data.getData('text/html');
  if (html) {
    const grid = readHtmlGrid(html);
    if (grid) return { source: 'html', grid: grid.map(row => row.map(cell => externalCell(cell))) };
  }
  const text = data.getData('text/plain');
  if (text.includes('\t') && (!root || rootTabularText(text))) return { source: 'text', grid: parseTsv(text).map(row => row.map(cell => externalCell(cell))) };
  if (allowScalar) {
    const scalar = readScalarCell(data);
    if (scalar) return { source: scalar.source, grid: [[scalar.markdown]] };
  }
  return null;
}

export function readGrid(data: ClipboardReader, allowScalar: boolean): string[][] | null {
  return readClipboardGrid(data, allowScalar)?.grid ?? null;
}

export function pasteSelectedCommand(model: TableModel, interaction: TableInteraction, grid: Grid): TableCommand | null {
  const bounds = selectionBounds(interaction, { rows: model.rows.length + 1, cols: model.header.length });
  const at = interaction.kind === 'editing' ? interaction.cell : bounds && { row: bounds.top, col: bounds.left };
  if (!at) return null;
  const normalized = rectangular(grid);
  const width = normalized[0]!.length;
  checkSize(Math.max(model.rows.length + 1, at.row + normalized.length), Math.max(model.header.length, at.col + width));
  return { kind: 'paste', ...at, grid: normalized };
}
