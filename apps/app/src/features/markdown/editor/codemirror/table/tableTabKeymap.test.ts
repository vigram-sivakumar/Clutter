// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableTabKeymap } from './tableTabKeymap';

function mountView(doc: string, anchor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdownLanguageExtension(), tableTabKeymap()],
  });
  return new EditorView({ state, parent });
}

function dispatchKey(view: EditorView, key: string, shiftKey = false): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
}

const TABLE = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';

describe('tableTabKeymap', () => {
  it('Tab moves to the END of the next cell\'s content, in row-major order', () => {
    const nameHeaderPos = TABLE.indexOf('Name') + 2;
    const view = mountView(TABLE, nameHeaderPos);
    dispatchKey(view, 'Tab');
    expect(view.state.selection.main.head).toBe(TABLE.indexOf('Role') + 'Role'.length);
  });

  it('Shift+Tab moves to the END of the previous cell\'s content', () => {
    const rolePos = TABLE.indexOf('Role') + 1;
    const view = mountView(TABLE, rolePos);
    dispatchKey(view, 'Tab', true);
    expect(view.state.selection.main.head).toBe(TABLE.indexOf('Name') + 'Name'.length);
  });

  it('Tab from an empty cell still moves to the next cell', () => {
    const doc = '| A | | C |\n| - | - | - |\n| 1 | | 3 |';
    const lastRow = '| 1 | | 3 |';
    const emptyCellPos = doc.lastIndexOf(lastRow) + lastRow.indexOf('| |') + 2;
    const view = mountView(doc, emptyCellPos);
    dispatchKey(view, 'Tab');
    expect(view.state.selection.main.head).toBe(doc.lastIndexOf('3') + 1);
  });

  it('landing in an empty destination cell uses its normal (single) empty-cell position', () => {
    const doc = '| A | | C |\n| - | - | - |\n| 1 | | 3 |';
    const lastRow = '| 1 | | 3 |';
    const threePos = doc.lastIndexOf('3');
    const emptyCellPos = doc.lastIndexOf(lastRow) + lastRow.indexOf('| |') + 1;
    const view = mountView(doc, threePos);
    dispatchKey(view, 'Tab', true); // Shift+Tab from "3" lands in the empty middle cell
    expect(view.state.selection.main.head).toBe(emptyCellPos);
  });

  it('Shift+Tab from the first cell of the table does nothing', () => {
    const doc = TABLE;
    const nameHeaderPos = doc.indexOf('Name') + 2;
    const view = mountView(doc, nameHeaderPos);
    dispatchKey(view, 'Tab', true);
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.selection.main.head).toBe(nameHeaderPos);
  });

  it('Tab at the final cell of the entire table does nothing — no row created, no transaction dispatched', () => {
    const designerEnd = TABLE.lastIndexOf('Designer') + 'Designer'.length; // inside the last cell, right after its content
    const view = mountView(TABLE, designerEnd);
    let dispatched = false;
    const originalDispatch = view.dispatch.bind(view);
    view.dispatch = ((...args: Parameters<typeof originalDispatch>) => {
      dispatched = true;
      return originalDispatch(...args);
    }) as typeof view.dispatch;

    dispatchKey(view, 'Tab');

    expect(dispatched).toBe(false);
    expect(view.state.doc.toString()).toBe(TABLE);
    expect(view.state.selection.main.head).toBe(designerEnd);
  });
});
