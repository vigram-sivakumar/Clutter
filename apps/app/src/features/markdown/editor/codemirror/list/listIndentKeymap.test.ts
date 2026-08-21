// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { dedentListItem, indentListItem } from './listIndentKeymap';

function mountView(doc: string, cursorPos: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdownLanguageExtension()],
  });
  return new EditorView({ state, parent });
}

describe('indentListItem', () => {
  it('indents a list item, nesting it under the preceding item', () => {
    const doc = '- item1\n- item2';
    const view = mountView(doc, doc.indexOf('item2'));

    const handled = indentListItem(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- item1\n  - item2');
  });

  it('does nothing outside a list — plain paragraph', () => {
    const doc = 'plain paragraph';
    const view = mountView(doc, 3);

    const handled = indentListItem(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('does nothing when the selection spans a line outside any list', () => {
    // A blank line breaks lazy continuation, so "plain paragraph" is a
    // genuinely separate block here, not part of the list item's own
    // paragraph content.
    const doc = '- item1\n\nplain paragraph';
    const view = mountView(doc, 0);
    view.dispatch({ selection: { anchor: 0, head: doc.length } });

    const handled = indentListItem(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('indents every list line spanned by a multi-line selection', () => {
    const doc = '- item1\n- item2\n- item3';
    const view = mountView(doc, 0);
    const from = doc.indexOf('item2');
    const to = doc.indexOf('item3') + 'item3'.length;
    view.dispatch({ selection: { anchor: from, head: to } });

    indentListItem(view);

    expect(view.state.doc.toString()).toBe('- item1\n  - item2\n  - item3');
  });
});

describe('dedentListItem', () => {
  it('removes one level of indentation from a nested list item', () => {
    const doc = '- item1\n  - item2';
    const view = mountView(doc, doc.indexOf('item2'));

    const handled = dedentListItem(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('- item1\n- item2');
  });

  it('does nothing on a top-level item with no indentation left to remove', () => {
    const doc = '- item1';
    const view = mountView(doc, doc.indexOf('item1'));

    const handled = dedentListItem(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('does nothing outside a list', () => {
    const doc = '  plain paragraph';
    const view = mountView(doc, 5);

    const handled = dedentListItem(view);

    expect(handled).toBe(false);
    expect(view.state.doc.toString()).toBe(doc);
  });
});
