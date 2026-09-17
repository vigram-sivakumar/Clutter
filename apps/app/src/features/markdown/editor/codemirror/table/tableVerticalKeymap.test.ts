// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableVerticalKeymap } from './tableVerticalKeymap';

function mountView(doc: string, anchor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdownLanguageExtension(), tableVerticalKeymap()],
  });
  return new EditorView({ state, parent });
}

function dispatchKey(view: EditorView, key: string): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('tableVerticalKeymap', () => {
  it('Down from the header never lands on the delimiter row — goes straight to the first data row, same column', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';
    const namePos = doc.indexOf('Name') + 2;
    const view = mountView(doc, namePos);
    dispatchKey(view, 'ArrowDown');
    expect(view.state.selection.main.head).toBe(doc.indexOf('Vik'));
  });

  it('Up from the first data row never lands on the delimiter row — goes straight to the header, same column', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';
    const vikPos = doc.indexOf('Vik') + 1;
    const view = mountView(doc, vikPos);
    dispatchKey(view, 'ArrowUp');
    expect(view.state.selection.main.head).toBe(doc.indexOf('Name'));
  });

  it('preserves the table column across cells of very different lengths (the reported bug)', () => {
    const doc = '| Name | Description|\n| --- | --- |\n| Vigram | This is another description I am here |\n| | |';
    const descriptionPos = doc.indexOf('Description') + 3; // column 2 of the (short) header
    const view = mountView(doc, descriptionPos);
    dispatchKey(view, 'ArrowDown');
    // Must land in column 2 of the much longer data row — not column 1 ("Vigram").
    expect(view.state.selection.main.head).toBe(doc.indexOf('This is another'));
  });

  it('preserves column when the destination cell is empty', () => {
    const doc = '| Name | Description|\n| --- | --- |\n| Vigram | This is another description I am here |\n| | |';
    const lastRow = '| | |';
    // This cell's gap is a single space; landing via `startOfCellContent`
    // skips past that one blank character, landing one position further
    // in than the gap's own left edge.
    const emptyCol2Start = doc.lastIndexOf(lastRow) + lastRow.lastIndexOf('| |') + 2;
    const descriptionDataPos = doc.indexOf('This is another') + 3;
    const view = mountView(doc, descriptionDataPos);
    dispatchKey(view, 'ArrowDown');
    expect(view.state.selection.main.head).toBe(emptyCol2Start);
  });

  it('preserves column when the source cell is empty', () => {
    const doc = '| Name | Description|\n| --- | --- |\n| Vigram | This is another description I am here |\n| | |';
    const lastRow = '| | |';
    const emptyCol2 = doc.lastIndexOf(lastRow) + lastRow.lastIndexOf('| |') + 1;
    const view = mountView(doc, emptyCol2);
    dispatchKey(view, 'ArrowUp');
    expect(view.state.selection.main.head).toBe(doc.indexOf('This is another'));
  });

  it('Up from the header defers to native (no target row to preserve a column into)', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';
    const namePos = doc.indexOf('Name') + 2;
    const view = mountView(doc, namePos);
    dispatchKey(view, 'ArrowUp');
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.selection.main.head).toBe(namePos);
  });
});
