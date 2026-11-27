import { describe, expect, it } from 'vitest';
import { parser } from '@lezer/markdown';
import { EditorState, ChangeSet, Transaction } from '@codemirror/state';
import { history, undo, redo, undoDepth, isolateHistory } from '@codemirror/commands';
import { markdownGrammarFor } from '@core/vault/ingest/grammar/markdownGrammarExtensions';
import { createCellTransaction, diffCellText, editableCell } from './tableCellTransaction';
import { readTable, TableEngineError } from './tableModel';
import { createTableTransaction } from './tableTransaction';

const grammar = parser.configure(markdownGrammarFor(false));
const parse = (text: string) => grammar.parse(text);
const prefix = 'Before\n\n';
const suffix = '\n\nAfter';
const doc = prefix + '| A | B |\n| --- | --- |\n| one | two |' + suffix;
const address = { row: 1, col: 0 };
const start = prefix.length;

function cell(state: EditorState) {
  return editableCell(state.doc.toString(), readTable(state.doc.toString(), start, parse), address);
}
function setup() {
  let state = EditorState.create({ doc, extensions: [history({ minDepth: 1000 })], selection: { anchor: doc.length } });
  return { get state() { return state; }, dispatch(tr: Transaction) { state = tr.state; } };
}

describe('table engine minimal cell changes', () => {
  it('maps multiple disjoint changes without rewriting padding or neighbouring cells', () => {
    const target = setup();
    const before = cell(target.state);
    const changes = ChangeSet.of([{ from: 0, to: 1, insert: 'O' }, { from: 3, insert: '!' }], 3);
    const tr = createCellTransaction(target.state, start, address, before.text, changes, parse)!;
    const ranges: number[][] = [];
    tr.changes.iterChanges((from, to) => ranges.push([from, to]));
    expect(ranges).toEqual([[before.from, before.from + 1], [before.to, before.to]]);
    expect(tr.newDoc.toString()).toBe(doc.replace('one', 'One!'));
    expect(tr.annotation(Transaction.userEvent)).toBe('input.type');
  });

  it('accepts a trailing space then continued typing without losing raw text', () => {
    const target = setup();
    let active = cell(target.state);
    for (const next of ['one ', 'one more']) {
      target.dispatch(createCellTransaction(target.state, start, address, active.text, diffCellText(active.text, next), parse, 'input.type', undefined, active)!);
      active = { from: active.from, to: active.from + next.length, text: next };
      expect(target.state.doc.sliceString(active.from, active.to)).toBe(next);
    }
    expect(undoDepth(target.state)).toBe(1);
    expect(undo(target)).toBe(true);
    expect(target.state.doc.toString()).toBe(doc);
    expect(redo(target)).toBe(true);
    expect(cell(target.state).text).toBe('one more');
  });

  it('excludes arbitrary source padding on activation without rewriting the source', () => {
    const source = prefix + '| A    | B  |\n| ---- | -- |\n| one  |    |' + suffix;
    const snap = readTable(source, start, parse);
    const one = editableCell(source, snap, address);
    const empty = editableCell(source, snap, { row: 1, col: 1 });
    expect(one.text).toBe('one');
    expect(empty.text).toBe('');
    const state = EditorState.create({ doc: source });
    const tr = createCellTransaction(state, start, address, one.text, diffCellText(one.text, 'one!'), parse)!;
    expect(tr.newDoc.toString()).toBe(source.replace('one  ', 'one!  '));
  });

  it('supports an empty canonical cell and refuses stale text', () => {
    const state = EditorState.create({ doc: doc.replace('one', '') });
    expect(cell(state).text).toBe('');
    const tr = createCellTransaction(state, start, address, '', diffCellText('', 'x'), parse)!;
    expect(cell(tr.state).text).toBe('x');
    expect(() => createCellTransaction(tr.state, start, address, '', diffCellText('', 'y'), parse)).toThrow('Stale cell revision');
  });

  it('rejects unsafe pipes and newlines before dispatch, but accepts escaped pipes', () => {
    const target = setup();
    for (const invalid of ['one|x', 'one\nx']) {
      expect(() => createCellTransaction(target.state, start, address, 'one', diffCellText('one', invalid), parse)).toThrow(TableEngineError);
    }
    const next = 'one\\|x';
    target.dispatch(createCellTransaction(target.state, start, address, 'one', diffCellText('one', next), parse)!);
    expect(cell(target.state).text).toBe(next);
  });

  it('refuses the reported unescaped pipe in a completed three-column header WikiLink', () => {
    const text = '[[Test note]]';
    const source = '| ' + text + ' |   |   |\n| ---- | - | - |\n|      |   |   |';
    const state = EditorState.create({ doc: source });
    const address = { row: 0, col: 0 };
    const active = editableCell(source, readTable(source, 0, parse), address);
    expect(active.text).toBe(text);
    expect(() => createCellTransaction(state, 0, address, text,
      diffCellText(text, '[[Test note|]]'), parse)).toThrow(TableEngineError);
    const escaped = '[[Test note\\|]]';
    const tr = createCellTransaction(state, 0, address, text, diffCellText(text, escaped), parse)!;
    expect(tr.newDoc.toString()).toBe(source.replace(text, escaped));
    const after = readTable(tr.newDoc.toString(), 0, parse);
    expect(after.model.header).toEqual([escaped, '', '']);
    expect(after.model.rows).toEqual([['', '', '']]);
  });

  // Characterise the installed table grammar's raw transport, without
  // changing the meaning of WikiLink escapes or enabling alias input yet.
  it.each([1, 3, 5])('preserves an escaped WikiLink pipe with %i backslashes in one cell and root history', (slashes) => {
    const target = setup();
    const before = cell(target.state);
    const next = '[[Folder/Note' + String.fromCharCode(92).repeat(slashes) + '|Label]]';
    const expected = doc.replace('one', next);
    target.dispatch(createCellTransaction(target.state, start, address, before.text,
      diffCellText(before.text, next), parse)!);
    expect(target.state.doc.toString()).toBe(expected);
    const snapshot = readTable(expected, start, parse);
    expect(snapshot.model.header).toEqual(['A', 'B']);
    expect(snapshot.model.rows).toEqual([[next, 'two']]);
    const active = cell(target.state);
    expect(active.text).toBe(next);
    expect(expected.slice(active.from, active.to)).toBe(next);
    expect(undo(target)).toBe(true);
    expect(target.state.doc.toString()).toBe(doc);
    expect(redo(target)).toBe(true);
    expect(target.state.doc.toString()).toBe(expected);
  });

  it('round-trips interleaved cell typing and structural actions in the root history', () => {
    const target = setup();
    const snapshots = [doc];
    const type = (next: string) => {
      const old = cell(target.state).text;
      target.dispatch(createCellTransaction(target.state, start, address, old, diffCellText(old, next), parse)!);
      target.dispatch(target.state.update({ annotations: isolateHistory.of('full') }));
      snapshots.push(target.state.doc.toString());
    };
    type('edited');
    target.dispatch(createTableTransaction(target.state, start, { kind: 'insertColumn', index: 2 }, parse)!);
    snapshots.push(target.state.doc.toString());
    type('edited again');
    for (let i = snapshots.length - 2; i >= 0; i--) {
      expect(undo(target)).toBe(true);
      expect(target.state.doc.toString()).toBe(snapshots[i]);
    }
    for (let i = 1; i < snapshots.length; i++) {
      expect(redo(target)).toBe(true);
      expect(target.state.doc.toString()).toBe(snapshots[i]);
    }
  });

  it('edits an overflow cell minimally without rewriting the imported table', () => {
    const source = prefix + '| A | B |\n| --- | --- |\n| one | two | extra |' + suffix;
    const extra = { row: 1, col: 2 };
    const state = EditorState.create({ doc: source });
    const snap = readTable(source, start, parse);
    const active = editableCell(source, snap, extra);
    expect(active.text).toBe('extra');
    const transaction = createCellTransaction(state, start, extra, active.text,
      diffCellText(active.text, 'edited'), parse)!;
    expect(transaction.newDoc.toString()).toBe(source.replace('extra', 'edited'));
    expect(readTable(transaction.newDoc.toString(), start, parse).model.rows[0]).toEqual(['one', 'two', 'edited']);
    expect(() => createCellTransaction(state, start, extra, active.text,
      diffCellText(active.text, 'extra|split'), parse)).toThrow(TableEngineError);
  });

  it('refuses changes that root filters reject', () => {
    const state = EditorState.create({ doc, extensions: [EditorState.transactionFilter.of(() => [])] });
    expect(() => createCellTransaction(state, start, address, 'one', diffCellText('one', 'two'), parse)).toThrow(TableEngineError);
  });
});
