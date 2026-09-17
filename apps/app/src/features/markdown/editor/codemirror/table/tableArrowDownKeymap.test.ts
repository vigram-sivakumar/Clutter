// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableArrowDownKeymap } from './tableArrowDownKeymap';

function mountView(doc: string, anchor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdownLanguageExtension(), tableArrowDownKeymap()],
  });
  return new EditorView({ state, parent });
}

function dispatchKey(view: EditorView, key: string): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

const TABLE = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';

describe('tableArrowDownKeymap', () => {
  it('does nothing (defers to native) when the caret is not in the table\'s last row', () => {
    // Native `cursorLineDown` isn't wired in this minimal test view, so a
    // "deferred" ArrowDown produces no change at all — that absence of any
    // change is exactly what proves this guard declined rather than acting.
    const doc = TABLE;
    const headerPos = doc.indexOf('Name') + 2;
    const view = mountView(doc, headerPos);
    dispatchKey(view, 'ArrowDown');
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.selection.main.head).toBe(headerPos);
  });

  it('at the last row with nothing below the table, creates one blank paragraph line and moves the caret there', () => {
    const doc = TABLE;
    const designerPos = doc.lastIndexOf('Designer') + 3;
    const view = mountView(doc, designerPos);
    dispatchKey(view, 'ArrowDown');
    expect(view.state.doc.toString()).toBe(TABLE + '\n');
    expect(view.state.selection.main.head).toBe(TABLE.length + 1);
  });

  it('does not create another line when a non-empty paragraph already exists below the table', () => {
    const doc = TABLE + '\n\nalready here';
    const designerPos = doc.indexOf('Designer') + 3;
    const view = mountView(doc, designerPos);
    dispatchKey(view, 'ArrowDown');
    expect(view.state.doc.toString()).toBe(doc); // unchanged — this guard declines
  });

  it('does not create another line when an empty paragraph already exists below the table', () => {
    const doc = TABLE + '\n\n'; // one trailing blank line already present
    const designerPos = doc.indexOf('Designer') + 3;
    const view = mountView(doc, designerPos);
    dispatchKey(view, 'ArrowDown');
    expect(view.state.doc.toString()).toBe(doc); // unchanged — this guard declines
  });
});
