// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { inlinePreviewExtensions } from '../highlight/inlineLivePreviewRegion';
import { markdownLanguageExtension } from '../markdownLanguage';
import type { ResolveTag } from './tagResolution';

function mountView(doc: string, resolver?: ResolveTag): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      markdownLanguageExtension(),
      inlinePreviewExtensions({ resolveTag: () => resolver }),
    ],
  });
  return new EditorView({ state, parent });
}

const resolvedTag = (): ResolveTag => () => ({ status: 'resolved', displayLabel: 'project', activate: vi.fn() });

describe('Tag selection — production inline extensions leave selection to CodeMirror', () => {
  it('preserves an explicitly dispatched selection endpoint inside an at-rest token', () => {
    // "x #project y" -- node spans [2, 10). Endpoint at 4 is strictly
    // inside, closer to 2 than to 10.
    const view = mountView('x #project y', resolvedTag());

    view.dispatch({ selection: { anchor: 0, head: 4 } });

    expect(view.state.selection.main.to).toBe(4);
  });

  it('preserves a reverse selection endpoint near the far boundary', () => {
    const view = mountView('x #project y', resolvedTag());

    view.dispatch({ selection: { anchor: 12, head: 9 } });

    expect(view.state.selection.main.from).toBe(9);
  });

  it('does not touch a selection that spans fully across the node from outside to outside', () => {
    const view = mountView('x #project y', resolvedTag());

    view.dispatch({ selection: { anchor: 0, head: 12 } });

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(12);
  });

  it('does not interfere with a document-changing transaction', () => {
    const view = mountView('x #project y', resolvedTag());

    view.dispatch({ changes: { from: 4, insert: '!' } });

    expect(view.state.doc.toString()).toBe('x #p!roject y');
  });

  it('an already-engaged Tag keeps the requested selection — it is just ordinary text at that point', () => {
    const view = mountView('x #project y', resolvedTag());
    view.dispatch({ selection: { anchor: 5 } }); // engage it first

    view.dispatch({ selection: { anchor: 4, head: 8 } });

    expect(view.state.selection.main.from).toBe(4);
    expect(view.state.selection.main.to).toBe(8);
  });
});
