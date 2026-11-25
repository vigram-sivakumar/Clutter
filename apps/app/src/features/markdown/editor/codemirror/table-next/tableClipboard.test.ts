// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parser } from '@lezer/markdown';
import { EditorState, type Transaction } from '@codemirror/state';
import { history, undo, redo, undoDepth } from '@codemirror/commands';
import { markdownGrammarFor } from '@core/vault/ingest/grammar/markdownGrammarExtensions';
import { clearSelectedCommand, externalCell, parseTsv, pasteSelectedCommand, readGrid, selectedGrid, TABLE_MIME, toTsv, writeGrid } from './tableClipboard';
import { createTableTransaction } from './tableTransaction';
import { readTable } from './tableModel';
import type { TableInteraction } from './tableInteraction';

const grammar = parser.configure(markdownGrammarFor(false));
const parse = (text: string) => grammar.parse(text);
const doc = '| A | B | C |\n| --- | --- | --- |\n| **one** | two | three |\n| four |  | six |';
const model = readTable(doc, 0, parse).model;
const selected: TableInteraction = { kind: 'range', anchor: { row: 2, col: 1 }, head: { row: 1, col: 0 } };
function clipboard(values: Record<string, string> = {}) {
  return { getData: (type: string) => values[type] ?? '', setData: (type: string, value: string) => { values[type] = value; } };
}

describe('table-next clipboard', () => {
  it('copies reverse ranges in row-major order including blank cells', () => {
    expect(selectedGrid(model, selected)).toEqual([['**one**', 'two'], ['four', '']]);
  });
  it('round-trips exact Markdown through the internal format', () => {
    const grid = selectedGrid(model, selected)!;
    const data = clipboard();
    writeGrid(data, grid, text => text);
    expect(readGrid(data, false)).toEqual(grid);
    expect(data.getData('text/plain')).toBe('**one**\ttwo\nfour\t');
    expect(data.getData('text/html')).toContain('<td></td>');
  });
  it('handles quoted TSV, empty cells and embedded delimiters', () => {
    const grid = [['', 'a\tb', 'a"b'], ['x', 'y\nz', '']];
    expect(parseTsv(toTsv(grid) + '\n')).toEqual(grid);
    expect(parseTsv('A\tB\tC\r\nx\ty\r\n')).toEqual([['A', 'B', 'C'], ['x', 'y', '']]);
  });
  it('escapes pipes and normalises external newlines without double escaping', () => {
    expect(externalCell('a|b')).toBe('a\\|b');
    expect(externalCell('a\\|b')).toBe('a\\|b');
    expect(externalCell('a\\\\|b')).toBe('a\\\\\\|b');
    expect(externalCell('a\r\nb')).toBe('a b');
  });
  it('prefers standalone HTML and refuses merged cells', () => {
    expect(readGrid(clipboard({ 'text/html': '<table><tr><td>A</td><td>B</td></tr></table>', 'text/plain': 'x\ty' }), false)).toEqual([['A', 'B']]);
    expect(() => readGrid(clipboard({ 'text/html': '<table><tr><td colspan="2">x</td></tr></table>' }), false)).toThrow();
  });
  it('does not consume non-tabular prose during active text editing', () => {
    expect(readGrid(clipboard({ 'text/plain': 'hello\nworld' }), false)).toBeNull();
    expect(readGrid(clipboard({ 'text/plain': 'hello\nworld' }), true)).toEqual([['hello world']]);
  });
  it('rejects malformed internal payload before any changes', () => {
    expect(() => readGrid(clipboard({ [TABLE_MIME]: '{"kind":"clutter-table-range","rows":[[42]]}' }), true)).toThrow();
  });
  it('pastes at the top-left without touching the rest of the selection', () => {
    const command = pasteSelectedCommand(model, selected, [['new']])!;
    const tr = createTableTransaction(EditorState.create({ doc }), 0, command, parse)!;
    expect(readTable(tr.newDoc.toString(), 0, parse).model.rows).toEqual([['new', 'two', 'three'], ['four', '', 'six']]);
  });
  it('cut/clear and expanding paste each undo in one root history step', () => {
    let state = EditorState.create({ doc, extensions: [history()] });
    const target = { get state() { return state; }, dispatch(tr: Transaction) { state = tr.state; } };
    target.dispatch(createTableTransaction(state, 0, clearSelectedCommand(model, selected)!, parse)!);
    const cleared = state.doc.toString();
    expect(readTable(cleared, 0, parse).model.rows).toEqual([['', '', 'three'], ['', '', 'six']]);
    const command = pasteSelectedCommand(readTable(cleared, 0, parse).model, { kind: 'cell', cell: { row: 2, col: 2 } }, [['x', 'y'], ['z', 'w']])!;
    target.dispatch(createTableTransaction(state, 0, command, parse)!);
    const pasted = state.doc.toString();
    expect(readTable(pasted, 0, parse).model.rows).toEqual([['', '', 'three', ''], ['', '', 'x', 'y'], ['', '', 'z', 'w']]);
    expect(undoDepth(state)).toBe(2);
    expect(undo(target)).toBe(true);
    expect(state.doc.toString()).toBe(cleared);
    expect(undo(target)).toBe(true);
    expect(state.doc.toString()).toBe(doc);
    expect(redo(target)).toBe(true);
    expect(redo(target)).toBe(true);
    expect(state.doc.toString()).toBe(pasted);
  });
});
