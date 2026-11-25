import { describe, expect, it } from 'vitest';
import { parser } from '@lezer/markdown';
import { history, redo, undo, undoDepth } from '@codemirror/commands';
import { Annotation, EditorState, Transaction } from '@codemirror/state';
import { markdownGrammarFor } from '@core/vault/ingest/grammar/markdownGrammarExtensions';
import { readTable, TableEngineError, validateModel } from './tableModel';
import { applyTableCommand, planTableEdit, type TableCommand } from './tableCommands';
import { tableRootSelectionSnap } from '../table/tableRootSelectionSnap';
import { markdownLanguageExtension } from '../markdownLanguage';
import { validatedRootEdit, createTableTransaction } from './tableTransaction';

const configured = parser.configure(markdownGrammarFor(false));
const parse = (source: string) => configured.parse(source);
const before = 'Before\n\n';
const after = '\n\nAfter';
const table = '| A | B |\n| --- | :---: |\n| one | two |';
const doc = before + table + after;
const start = before.length;

describe('table engine model and structural commands', () => {
  it.each(['--- | ---', '--- | :--- | ---', '| --- | --- |'])(
    'gives GFM delimiter rows precedence over Clutter labelled dividers: %s',
    (delimiter) => {
      const header = delimiter === '--- | :--- | ---' ? 'A | B | C' : 'A | B';
      const text = header + '\n' + delimiter;
      const snapshot = readTable(text, 0, parse);
      expect(snapshot.model.header).toEqual(header.split(' | '));
      expect(snapshot.source).toBe(text);
      expect(parse(text).toString()).not.toContain('LabeledHorizontalRule');
    }
  );

  it('still recognises an ordinary labelled divider after a paragraph', () => {
    expect(parse('Paragraph\n--- Chapter 1 ---').toString()).toContain('LabeledHorizontalRule');
  });

  it('derives one model and range map from the shared parser', () => {
    const snapshot = readTable(doc, start, parse);
    expect(snapshot.model).toEqual({ header: ['A', 'B'], rows: [['one', 'two']], alignments: ['none', 'center'], columnWidths: null });
    const cell = snapshot.cells[1]![1]!;
    expect(doc.slice(cell.from, cell.to)).toBe('two');
    expect(snapshot.source).toBe(table);
  });

  it('preserves optional outer pipes, missing cell source and escaped Markdown on read', () => {
    const text = String.raw`A \| B | C` + '\n--- | ---\nonly |';
    // The existing Clutter grammar recognises the optional outer pipes.
    const snapshot = readTable(text, 0, parse);
    expect(snapshot.model.header).toEqual(['A \\| B', 'C']);
    expect(snapshot.model.rows).toEqual([['only', '']]);
    expect(snapshot.cells[1]![1]).toBeNull();
    expect(snapshot.source).toBe(text);
  });

  it('keeps all column metadata aligned during move, duplicate and delete', () => {
    const input = table + '\n{table-col-widths="120,300"}';
    const moved = planTableEdit(input, 0, { kind: 'moveColumn', from: 0, to: 1 }, parse)!;
    expect(moved.after.model.header).toEqual(['B', 'A']);
    expect(moved.after.model.alignments).toEqual(['center', 'none']);
    expect(moved.after.model.columnWidths).toEqual([300, 120]);
    const duplicate = planTableEdit(moved.expectedDocument, 0, { kind: 'duplicateColumn', index: 0 }, parse)!;
    expect(duplicate.after.model.columnWidths).toEqual([300, 300, 120]);
    const deleted = planTableEdit(duplicate.expectedDocument, 0, { kind: 'deleteColumn', index: 1 }, parse)!;
    expect(deleted.expectedDocument).toBe(moved.expectedDocument);
  });

  it('grows every row and width array together on paste', () => {
    const input = before + table + '\n{table-col-widths="120,300"}' + after;
    const edit = planTableEdit(input, start, { kind: 'paste', row: 1, col: 1, grid: [['x', 'y'], ['z', 'w']] }, parse)!;
    expect(edit.after.model.header).toEqual(['A', 'B', '']);
    expect(edit.after.model.rows).toEqual([['one', 'x', 'y'], ['', 'z', 'w']]);
    expect(edit.after.model.columnWidths).toEqual([120, 300, 200]);
    expect(edit.expectedDocument.startsWith(before)).toBe(true);
    expect(edit.expectedDocument.endsWith(after)).toBe(true);
  });

  it('rejects a raw pipe that would create an unintended new column', () => {
    expect(() => planTableEdit(doc, start, { kind: 'setCell', row: 1, col: 0, markdown: 'a|b' }, parse)).toThrow(TableEngineError);
    expect(planTableEdit(doc, start, { kind: 'setCell', row: 1, col: 0, markdown: 'a\\|b' }, parse)!.after.model.rows[0]![0]).toBe('a\\|b');
  });

  it('rejects multiline cells and malformed metadata before committing', () => {
    expect(() => planTableEdit(doc, start, { kind: 'setCell', row: 1, col: 0, markdown: 'a\nb' }, parse)).toThrow(TableEngineError);
    expect(() => planTableEdit(table + '\n{table-col-widths="120"}', 0, { kind: 'insertColumn', index: 1 }, parse)).toThrow(TableEngineError);
    expect(() => readTable('| A | B |\n| --- | --- |\n| x | y | z |', 0, parse)).toThrow(TableEngineError);
  });

  it('does not normalise the document for a semantic no-op', () => {
    expect(planTableEdit(doc, start, { kind: 'setCell', row: 0, col: 0, markdown: 'A' }, parse)).toBeNull();
    expect(planTableEdit(doc, start, { kind: 'moveColumn', from: 0, to: 0 }, parse)).toBeNull();
  });
});

function makeHistory(source: string) {
  let state = EditorState.create({ doc: source, extensions: [history({ minDepth: 1000 })], selection: { anchor: source.length } });
  const target = {
    get state() { return state; },
    dispatch(tr: Transaction) { state = tr.state; },
  };
  return target;
}

describe('table engine root history', () => {
  it('deletes only the addressed table and its width line in a single reversible edit', () => {
    const original = table + '\n{table-col-widths=" 90, 210 "}';
    const prefix = doc + '\n\n';
    const suffix = '\n\n{unrelated="attribute"}';
    const target = makeHistory(prefix + original + suffix);
    target.dispatch(createTableTransaction(target.state, prefix.length, { kind: 'deleteTable' }, parse)!);
    expect(target.state.doc.toString()).toBe(prefix + suffix);
    expect(target.state.selection.main.head).toBe(prefix.length);
    expect(undoDepth(target.state)).toBe(1);
    expect(undo(target)).toBe(true);
    expect(target.state.doc.toString()).toBe(prefix + original + suffix);
    expect(redo(target)).toBe(true);
    expect(target.state.doc.toString()).toBe(prefix + suffix);
  });

  it('retains root history identity when the production caret filter corrects a validated edit', () => {
    let state = EditorState.create({ doc, extensions: [markdownLanguageExtension(), tableRootSelectionSnap(), history()] });
    const target = { get state() { return state; }, dispatch(tr: Transaction) { state = tr.state; } };
    const expected = doc.replace('one', 'ONE');
    const at = doc.indexOf('one');
    const tr = validatedRootEdit(state, { from: at, to: at + 3, insert: 'ONE' }, expected,
      'input.table', true, undefined, { selection: { anchor: at + 1 } });
    target.dispatch(tr);
    expect(state.doc.toString()).toBe(expected);
    expect(state.selection.main.head < start || state.selection.main.head >= start + table.length).toBe(true);
    expect(undoDepth(state)).toBe(1);
    expect(undo(target)).toBe(true);
    expect(state.doc.toString()).toBe(doc);
    expect(redo(target)).toBe(true);
    expect(state.doc.toString()).toBe(expected);
  });

  it('preserves caller annotations and history exclusion through caret correction', () => {
    const external = Annotation.define<string>();
    const state = EditorState.create({ doc, extensions: [markdownLanguageExtension(), tableRootSelectionSnap(), history()] });
    const tr = state.update({
      selection: { anchor: start + 2 },
      annotations: [external.of('disk-refresh'), Transaction.addToHistory.of(false)],
    });
    expect(tr.annotation(external)).toBe('disk-refresh');
    expect(tr.annotation(Transaction.addToHistory)).toBe(false);
    expect(undoDepth(tr.state)).toBe(0);
  });

  it('adds 100 rows, undoes each exact source revision, then redoes each', () => {
    const target = makeHistory(doc);
    const snapshots = [doc];
    for (let i = 0; i < 100; i++) {
      const tr = createTableTransaction(target.state, start, { kind: 'insertRow', index: i + 2 }, parse)!;
      target.dispatch(tr);
      snapshots.push(target.state.doc.toString());
    }
    expect(undoDepth(target.state)).toBe(100);
    for (let i = 99; i >= 0; i--) {
      expect(undo(target)).toBe(true);
      expect(target.state.doc.toString()).toBe(snapshots[i]);
      expect(readTable(snapshots[i]!, start, parse).model.rows).toHaveLength(i + 1);
    }
    for (let i = 1; i <= 100; i++) {
      expect(redo(target)).toBe(true);
      expect(target.state.doc.toString()).toBe(snapshots[i]);
    }
  });

  it('round-trips a deterministic mixed command sequence and keeps surrounding Markdown byte-identical', () => {
    const target = makeHistory(doc);
    const snapshots = [doc];
    let seed = 73519;
    const pick = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
    for (let i = 0; i < 160; i++) {
      const model = readTable(target.state.doc.toString(), start, parse).model;
      const n = model.header.length;
      const r = model.rows.length + 1;
      const col = pick(n);
      const row = pick(r);
      const choices: TableCommand[] = [
        { kind: 'insertRow', index: 1 + pick(r) },
        { kind: 'insertColumn', index: pick(n + 1) },
        { kind: 'setCell', row, col, markdown: 'value ' + i },
        { kind: 'resizeColumn', col, width: 60 + pick(400) },
        { kind: 'moveColumn', from: col, to: pick(n) },
        { kind: 'moveRow', from: row, to: pick(r) },
        { kind: 'setAlignment', col, alignment: 'right' },
        ...(n > 1 ? [{ kind: 'deleteColumn', index: col } as const] : []),
        ...(r > 1 ? [{ kind: 'deleteRow', index: row } as const] : []),
      ];
      const command = choices[pick(choices.length)]!;
      const expected = applyTableCommand(model, command);
      const tr = createTableTransaction(target.state, start, command, parse);
      if (!tr) continue;
      target.dispatch(tr);
      const source = target.state.doc.toString();
      expect(source.startsWith(before)).toBe(true);
      expect(source.endsWith(after)).toBe(true);
      const actual = readTable(source, start, parse).model;
      validateModel(actual);
      expect(actual).toEqual(expected);
      snapshots.push(source);
    }
    expect(undoDepth(target.state)).toBe(snapshots.length - 1);
    for (let i = snapshots.length - 2; i >= 0; i--) {
      expect(undo(target)).toBe(true);
      expect(target.state.doc.toString()).toBe(snapshots[i]);
    }
    for (let i = 1; i < snapshots.length; i++) {
      expect(redo(target)).toBe(true);
      expect(target.state.doc.toString()).toBe(snapshots[i]);
    }
  });

  it('refuses a filter that changes a validated command', () => {
    const state = EditorState.create({ doc, extensions: [history(), EditorState.transactionFilter.of(() => [])] });
    expect(() => createTableTransaction(state, start, { kind: 'insertRow', index: 2 }, parse)).toThrow(TableEngineError);
    expect(state.doc.toString()).toBe(doc);
  });

  it('never changes a read-only document', () => {
    const state = EditorState.create({ doc, extensions: [EditorState.readOnly.of(true)] });
    expect(createTableTransaction(state, start, { kind: 'insertRow', index: 2 }, parse)).toBeNull();
  });
});
