// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { toggleWrap } from './formatShortcutsKeymap';

function mountView(doc: string, anchor: number, head = anchor): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor, head },
    extensions: [markdownLanguageExtension()],
  });
  return new EditorView({ state, parent });
}

describe('toggleWrap', () => {
  it('wraps a selection in the marker pair', () => {
    const doc = 'hello world';
    const view = mountView(doc, 0, 5);

    const handled = toggleWrap('**')(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('**hello** world');
  });

  it('places the selection around the wrapped text, not the markers', () => {
    const doc = 'hello world';
    const view = mountView(doc, 0, 5);

    toggleWrap('**')(view);

    expect(view.state.selection.main.from).toBe(2);
    expect(view.state.selection.main.to).toBe(7);
  });

  it('unwraps a selection already exactly flanked by the marker', () => {
    const doc = '**hello** world';
    const view = mountView(doc, 2, 7);

    const handled = toggleWrap('**')(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('hello world');
  });

  it('with an empty selection, inserts an empty marker pair and places the cursor between them', () => {
    const doc = 'hello world';
    const view = mountView(doc, 5);

    const handled = toggleWrap('**')(view);

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('hello**** world');
    expect(view.state.selection.main.head).toBe(7);
  });

  it('supports the italic marker independently of bold', () => {
    const doc = 'hello world';
    const view = mountView(doc, 0, 5);

    toggleWrap('*')(view);

    expect(view.state.doc.toString()).toBe('*hello* world');
  });

  it('supports the inline-code marker', () => {
    const doc = 'hello world';
    const view = mountView(doc, 0, 5);

    toggleWrap('`')(view);

    expect(view.state.doc.toString()).toBe('`hello` world');
  });

  it('wraps rather than unwraps when only one side matches the marker', () => {
    const doc = '**hello world';
    const view = mountView(doc, 2, 7);

    toggleWrap('**')(view);

    expect(view.state.doc.toString()).toBe('****hello** world');
  });
});
