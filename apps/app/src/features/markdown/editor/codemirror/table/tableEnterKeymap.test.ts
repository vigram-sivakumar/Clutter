// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { history, redo, undo, undoDepth } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableEnterKeymap } from './tableEnterKeymap';

function mountView(doc: string, anchor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdownLanguageExtension(), tableEnterKeymap(), history()],
  });
  return new EditorView({ state, parent });
}

function dispatchEnter(view: EditorView): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
}

const TABLE = '| Name | Role |\n| --- | --- |\n| Vikram | Designer |';

describe('tableEnterKeymap', () => {
  it('creates an empty row immediately below the current one, preserving column count', () => {
    const midVikram = TABLE.indexOf('Vikram') + 2; // between "Vi" and "kram"
    const view = mountView(TABLE, midVikram);
    dispatchEnter(view);
    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| Vikram | Designer |\n| | |');
  });

  it('never splits the existing cell text', () => {
    const midVikram = TABLE.indexOf('Vikram') + 2;
    const view = mountView(TABLE, midVikram);
    dispatchEnter(view);
    expect(view.state.doc.toString()).toContain('| Vikram | Designer |');
  });

  it('moves the cursor into the same column of the new row', () => {
    const roleCol = TABLE.indexOf('Designer') + 3; // inside the second column, "Role"/"Designer"
    const view = mountView(TABLE, roleCol);
    dispatchEnter(view);
    const doc = view.state.doc.toString();
    const newRowStart = doc.lastIndexOf('\n| | |') + 1;
    // "| | |" contains two overlapping "| |" matches (at offset 0 and 2) —
    // the second one (offset 2) is column 1's own gap; +1 lands inside its space.
    const secondColumnPos = newRowStart + doc.slice(newRowStart).lastIndexOf('| |') + 1;
    expect(view.state.selection.main.head).toBe(secondColumnPos);
  });

  it('works when the current cell is already empty', () => {
    const doc = '| A | |\n| --- | --- |\n| 1 | |';
    const emptyCellPos = doc.lastIndexOf('| |') + 2;
    const view = mountView(doc, emptyCellPos);
    dispatchEnter(view);
    expect(view.state.doc.toString()).toBe('| A | |\n| --- | --- |\n| 1 | |\n| | |');
  });

  it('works in the first data row (row immediately below the delimiter)', () => {
    const doc = TABLE + '\n| Sam | Developer |';
    const nameCol = doc.indexOf('Vikram') + 2;
    const view = mountView(doc, nameCol);
    dispatchEnter(view);
    expect(view.state.doc.toString()).toBe(
      '| Name | Role |\n| --- | --- |\n| Vikram | Designer |\n| | |\n| Sam | Developer |'
    );
  });

  it('is a single undo step', () => {
    const midVikram = TABLE.indexOf('Vikram') + 2;
    const view = mountView(TABLE, midVikram);
    const depthBefore = undoDepth(view.state);
    dispatchEnter(view);
    expect(undoDepth(view.state)).toBe(depthBefore + 1);
    undo(view);
    expect(view.state.doc.toString()).toBe(TABLE);
    redo(view);
    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| Vikram | Designer |\n| | |');
  });

  it('Enter in the header inserts the new row after the delimiter, not directly after the header — keeping header/delimiter adjacent', () => {
    const nameHeaderPos = TABLE.indexOf('Name') + 2; // between "Na" and "me"
    const view = mountView(TABLE, nameHeaderPos);
    dispatchEnter(view);
    expect(view.state.doc.toString()).toBe('| Name | Role |\n| --- | --- |\n| | |\n| Vikram | Designer |');
  });
});
