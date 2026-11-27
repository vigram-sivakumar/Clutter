import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { logicalCellText, tableCellTransport } from './tableCellTransport';
import { externalPasteNormalization, normalizeExternalPaste } from '../paste/externalPaste';

const slash = String.fromCharCode(92);
const stored = (n: number) => slash.repeat(2 * n + 1) + '|';
function state(doc: string, anchor = doc.length) {
  return EditorState.create({ doc, selection: { anchor }, extensions: [tableCellTransport()] });
}

describe('table cell transport offsets', () => {
  it.each([0, 1, 2, 3])('preserves %i logical slashes before the pipe', n => {
    const logical = 'A' + slash.repeat(n) + '|B';
    const raw = 'A' + stored(n) + 'B';
    expect(logicalCellText(raw)).toBe(logical);
    const before = state('A' + slash.repeat(n) + 'B', n + 1);
    const tr = before.update({ ...before.replaceSelection('|'), userEvent: 'input.type' });
    expect(tr.newDoc.toString()).toBe(raw);
    expect(tr.newSelection.main.head).toBe(raw.length - 1);
  });

  it.each(['delete.backward', 'delete.forward'])('deletes the whole transported pipe on %s, including native half-pair deletion', event => {
    const raw = 'A' + stored(0) + 'B';
    const before = state(raw, event === 'delete.backward' ? 3 : 1);
    const from = event === 'delete.backward' ? 2 : 1;
    const tr = before.update({ changes: { from, to: from + 1 }, selection: { anchor: from }, userEvent: event });
    expect(tr.newDoc.toString()).toBe('AB');
    expect(tr.newSelection.main.head).toBe(1);
  });

  it('removes a logical slash without removing the pipe, then removes the pipe without leaving transport bytes', () => {
    const before = state('A' + stored(1) + 'B', 3);
    const tr = before.update({ changes: { from: 1, to: 3 }, selection: { anchor: 1 }, userEvent: 'delete.backward' });
    expect(tr.newDoc.toString()).toBe('A' + stored(0) + 'B');
    const deleted = tr.state.update({ changes: { from: 1, to: 3 }, selection: { anchor: 1 }, userEvent: 'delete.forward' });
    expect(deleted.newDoc.toString()).toBe('AB');
  });

  it('retains user-authored slash when the following pipe is removed', () => {
    const before = state('A' + stored(1) + 'B', 5);
    const tr = before.update({ changes: { from: 3, to: 5 }, selection: { anchor: 3 }, userEvent: 'delete.backward' });
    expect(tr.newDoc.toString()).toBe('A' + slash + 'B');
    expect(tr.newSelection.main.head).toBe(2);
  });

  it('encodes pasted or composed logical text once, with a mapped selection', () => {
    for (const userEvent of ['input.paste', 'input.type.compose']) {
      const before = state('AB', 1);
      const text = 'x' + slash + '|y|';
      const tr = before.update({ ...before.replaceSelection(text), userEvent });
      expect(tr.newDoc.toString()).toBe('Ax' + stored(1) + 'y' + stored(0) + 'B');
      expect(tr.newSelection.main.head).toBe(tr.newDoc.length - 1);
    }
  });

  it('maps disjoint formatting changes without replacing the intervening transported text', () => {
    const raw = 'A' + stored(0) + 'B';
    const before = state(raw);
    const tr = before.update({ changes: [{ from: 0, insert: '**' }, { from: raw.length, insert: '**' }], userEvent: 'input.format' });
    expect(tr.newDoc.toString()).toBe('**' + raw + '**');
    const ranges: number[][] = [];
    tr.changes.iterChanges((from, to) => ranges.push([from, to]));
    expect(ranges).toEqual([[0, 0], [raw.length, raw.length]]);
  });

  it('snaps a caret and forward/reverse selection out of a hidden pair without a document change', () => {
    const before = state('A' + stored(0) + 'B', 1);
    const caret = before.update({ selection: { anchor: 2 } });
    expect(caret.docChanged).toBe(false);
    expect(caret.newSelection.main.head).toBe(3);
    for (const selection of [{ anchor: 0, head: 2 }, { anchor: 2, head: 0 }]) {
      const tr = before.update({ selection });
      expect(tr.docChanged).toBe(false);
      expect([tr.newSelection.main.from, tr.newSelection.main.to]).toEqual([0, 3]);
      expect(tr.newSelection.main.anchor === 0).toBe(selection.anchor === 0);
    }
  });

  it('copies logical text while keeping exact raw source and does not alter unannotated edits', () => {
    const raw = 'A' + stored(1) + 'B';
    const before = state(raw);
    const output = before.facet(EditorView.clipboardOutputFilter).reduce((text, filter) => filter(text, before), raw);
    expect(output).toBe('A' + slash + '|B');
    expect(before.doc.toString()).toBe(raw);
    const partial = before.update({ selection: { anchor: 1, head: 3 } }).state;
    const copiedSlash = partial.facet(EditorView.clipboardOutputFilter).reduce(
      (text, filter) => filter(text, partial), partial.sliceDoc(1, 3));
    expect(copiedSlash).toBe(slash);
    expect(state('A').update({ changes: { from: 1, insert: '|' } }).newDoc.toString()).toBe('A|');
  });

  it('records decoded logical cell copy for the shared paste provenance filter', () => {
    const raw = '- \\[ \\] Task [[Page\\|Alias]]';
    const cellState = state(raw);
    const copied = cellState.facet(EditorView.clipboardOutputFilter).reduce(
      (text, filter) => filter(text, cellState), raw);
    expect(copied).toBe('- \\[ \\] Task [[Page|Alias]]');
    expect(normalizeExternalPaste(copied)).toBe('- [ ] Task [[Page|Alias]]');
    const pasteState = EditorState.create({ extensions: [externalPasteNormalization()] });
    const input = pasteState.facet(EditorView.clipboardInputFilter).reduce(
      (text, filter) => filter(text, pasteState), copied);
    expect(input).toBe(copied);
  });
});
