import { describe, expect, it } from 'vitest';
import { EditorState, type Transaction } from '@codemirror/state';
import { history, undo, redo, undoDepth } from '@codemirror/commands';
import { parser } from '@lezer/markdown';
import { markdownGrammarFor } from '@core/vault/ingest/grammar/markdownGrammarExtensions';
import { createPastedTable } from './tableCreatePaste';
import { bookmark, restoredSelection, tableSelectionHistory, tableSelectionTransition } from './tableSelectionHistory';
import { createTableTransaction } from './tableTransaction';
import { createCellTransaction, diffCellText } from './tableCellTransaction';
import { readTable } from './tableModel';
import { dragScrollTarget, edgeScroll, visibleScrollBounds } from './tableDragScroll';
const grammar = parser.configure(markdownGrammarFor(false));
const parse = (text: string) => grammar.parse(text);
function target(doc: string, anchor = 0) {
  let state = EditorState.create({ doc, selection: { anchor }, extensions: [history(), tableSelectionHistory] });
  let last: Transaction | undefined;
  return { get state() { return state; }, get last() { return last; }, dispatch(tr: Transaction) { last = tr; state = tr.state; } };
}
describe('table engine history bookmarks and creation', () => {
  it('restores exact range intent on undo and redo using root history effects', () => {
    const doc = '| A | B |\n| --- | --- |\n| x | y |';
    const t = target(doc);
    const before = bookmark(0, { kind: 'range', anchor: { row: 0, col: 0 }, head: { row: 1, col: 1 } });
    const after = bookmark(0, { kind: 'cell', cell: { row: 1, col: 1 } });
    t.dispatch(createTableTransaction(t.state, 0, { kind: 'insertColumn', index: 2 }, parse,
      tableSelectionTransition.of({ before, after }))!);
    const changed = t.state.doc.toString();
    expect(undoDepth(t.state)).toBe(1);
    expect(undo(t)).toBe(true);
    expect(t.state.doc.toString()).toBe(doc);
    expect(restoredSelection(t.last!)).toEqual(before);
    expect(redo(t)).toBe(true);
    expect(t.state.doc.toString()).toBe(changed);
    expect(restoredSelection(t.last!)).toEqual(after);
  });
  it('restores caret-free cell selection through grouped typing undo and redo', () => {
    const doc = '| A | B |\n| --- | --- |\n| x | y |';
    const t = target(doc);
    const at = { row: 1, col: 0 };
    const mark = bookmark(0, { kind: 'cell', cell: at });
    for (const [old, next] of [['x', 'xy'], ['xy', 'xyz']] as const) {
      t.dispatch(createCellTransaction(t.state, 0, at, old, diffCellText(old, next), parse, 'input.type',
        tableSelectionTransition.of({ before: mark, after: mark }))!);
    }
    expect(undoDepth(t.state)).toBe(1);
    expect(undo(t)).toBe(true);
    expect(t.state.doc.toString()).toBe(doc);
    expect(restoredSelection(t.last!)).toEqual(mark);
    expect(redo(t)).toBe(true);
    expect(readTable(t.state.doc.toString(), 0, parse).model.rows[0]?.[0]).toBe('xyz');
    expect(restoredSelection(t.last!)).toEqual(mark);
  });
  it('never restores a nested editor from a history bookmark', () => {
    expect(bookmark(4, { kind: 'editing', cell: { row: 0, col: 1 } })).toEqual({ tableFrom: 4, interaction: { kind: 'cell', cell: { row: 0, col: 1 } } });
  });
  it('creates a second table without changing surrounding source and undoes it in one step', () => {
    const doc = '| A | B |\n| --- | --- |\n| x | y |\n\nText';
    const t = target(doc, doc.length);
    const tr = createPastedTable(t.state, [['Name', 'Role'], ['Ada', 'Design']], parse)!;
    t.dispatch(tr);
    const after = t.state.doc.toString();
    expect(after.startsWith(doc + '\n\n')).toBe(true);
    expect(readTable(after, doc.length + 2, parse).model.rows).toEqual([['Ada', 'Design']]);
    expect(undo(t)).toBe(true);
    expect(t.state.doc.toString()).toBe(doc);
    expect(restoredSelection(t.last!)).toBeNull();
    expect(redo(t)).toBe(true);
    expect(t.state.doc.toString()).toBe(after);
    expect(restoredSelection(t.last!)).toEqual(bookmark(doc.length + 2, { kind: 'cell', cell: { row: 0, col: 0 } }));
  });
  it('preserves text on both sides of an insertion', () => {
    const t = target('BeforeAfter', 6);
    const tr = createPastedTable(t.state, [['A', 'B']], parse)!;
    expect(tr.newDoc.toString()).toBe('Before\n\n| A | B |\n| --- | --- |\n\nAfter');
  });
  it('declines fenced code and existing table interiors', () => {
    expect(createPastedTable(target('~~~\ncode\n~~~', 6).state, [['A', 'B']], parse)).toBeNull();
    expect(createPastedTable(target('| A | B |\n| --- | --- |', 3).state, [['A', 'B']], parse)).toBeNull();
  });
  it('clips drag targets to the visible scrollport client area, not the table width or scrollbar', () => {
    const bounds = visibleScrollBounds({ left: 20, top: 40 }, 300, 150, 250, 180)!;
    expect(bounds).toEqual({ left: 20, right: 250, top: 40, bottom: 180 });
    expect(dragScrollTarget(500, 500, bounds)).toEqual({ x: 249, y: 179 });
    expect(dragScrollTarget(-20, -30, bounds)).toEqual({ x: 21, y: 41 });
    expect(visibleScrollBounds({ left: 300, top: 0 }, 100, 100, 250, 180)).toBeNull();
  });
  it('edge scroll is symmetric, bounded and zero in the interior', () => {
    expect(edgeScroll(50, 0, 100)).toBe(0);
    expect(edgeScroll(16, 0, 100)).toBe(-11);
    expect(edgeScroll(84, 0, 100)).toBe(11);
    expect(edgeScroll(-500, 0, 100)).toBe(-22);
    expect(edgeScroll(500, 0, 100)).toBe(22);
  });
});
