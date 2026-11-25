import { isolateHistory } from '@codemirror/commands';
import { EditorState, Transaction } from '@codemirror/state';
import { modelsEqual, readTable, serializeTable, TableEngineError, type ParseMarkdown, type TableModel } from './tableModel';
import type { Grid } from './tableClipboard';
import { bookmark, tableSelectionTransition } from './tableSelectionHistory';

/** Prototype creation only at a top-level blank line or within a plain
 * top-level paragraph. Do not reinterpret code, lists, quotes or tables.
 * Preserve all unselected text, insert blank separators, reparse the full
 * document before committing.
 */
export function createPastedTable(state: EditorState, grid: Grid, parse: ParseMarkdown): Transaction | null {
  if (state.readOnly || state.selection.ranges.length !== 1) return null;
  const header = grid[0];
  if (!header?.length) return null;
  const model: TableModel = { header: header.map(cell => cell.trim()), rows: grid.slice(1).map(row => row.map(cell => cell.trim())),
    alignments: header.map(() => 'none'), columnWidths: null };
  if (grid.some(row => row.some(cell => /[\r\n]/.test(cell)))) throw new TableEngineError('Multiline source cell');
  const source = state.doc.toString();
  const { from, to } = state.selection.main;
  const tree = parse(source);
  // No ambiguous partial block replacement. Empty lines and a selection
  // inside a plain paragraph are supported, including at document ends.
  let blocked = false;
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    const intersects = from === to ? from >= node.from && from <= node.to : from < node.to && to > node.from;
    if (intersects && node.name !== 'Paragraph') blocked = true;
  }
  if (blocked) return null;
  if (from !== to && state.doc.lineAt(from).number !== state.doc.lineAt(to).number) return null;
  const before = source.slice(0, from), after = source.slice(to);
  const left = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const right = !after || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const table = serializeTable(model);
  const at = from + left.length;
  const insert = left + table + right;
  const expected = before + insert + after;
  const snapshot = readTable(expected, at, parse);
  if (!modelsEqual(model, snapshot.model) || snapshot.to !== at + table.length) throw new TableEngineError('Pasted table failed full-document validation');
  const effect = tableSelectionTransition.of({ before: null, after: bookmark(at, { kind: 'cell', cell: { row: 0, col: 0 } }) });
  const tr = state.update({ changes: { from, to, insert }, selection: { anchor: from + insert.length },
    effects: effect, annotations: isolateHistory.of('full'), userEvent: 'input.paste.table' });
  if (tr.newDoc.toString() !== expected || tr.annotation(Transaction.addToHistory) === false ||
    tr.annotation(isolateHistory) !== 'full' || !tr.effects.includes(effect)) throw new TableEngineError('Paste transaction changed by filters');
  return tr;
}
