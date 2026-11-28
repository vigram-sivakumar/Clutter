// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { inlinePreviewExtensions } from '../highlight/inlineLivePreviewRegion';
import { markdownLanguageExtension } from '../markdownLanguage';
import type { ResolveDate } from './dateResolution';

function mountView(doc: string, resolver?: ResolveDate): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      markdownLanguageExtension(),
      inlinePreviewExtensions({ resolveDate: () => resolver }),
    ],
  });
  return new EditorView({ state, parent });
}

const resolved = (): ResolveDate => () => ({ activate: vi.fn() });

describe('Date selection — production inline extensions leave selection to CodeMirror', () => {
  it('preserves an explicitly dispatched selection endpoint inside an at-rest token', () => {
    // "x @2026-08-20 y" -- node spans [2, 13). Endpoint at 4 is strictly
    // inside, closer to 2 than to 13.
    const view = mountView('x @2026-08-20 y', resolved());

    view.dispatch({ selection: { anchor: 0, head: 4 } });

    expect(view.state.selection.main.to).toBe(4);
  });

  it('preserves a reverse selection endpoint near the far boundary', () => {
    const view = mountView('x @2026-08-20 y', resolved());

    view.dispatch({ selection: { anchor: 15, head: 12 } });

    expect(view.state.selection.main.from).toBe(12);
  });

  it('does not touch a selection that spans fully across the node from outside to outside', () => {
    const view = mountView('x @2026-08-20 y', resolved());

    view.dispatch({ selection: { anchor: 0, head: 15 } });

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(15);
  });

  it('does not interfere with a document-changing transaction', () => {
    const view = mountView('x @2026-08-20 y', resolved());

    view.dispatch({ changes: { from: 4, insert: '!' } });

    expect(view.state.doc.toString()).toBe('x @2!026-08-20 y');
  });

  it('an already-engaged Date keeps the requested selection', () => {
    const view = mountView('x @2026-08-20 y', resolved());
    view.dispatch({ selection: { anchor: 5 } }); // engage it first

    view.dispatch({ selection: { anchor: 4, head: 8 } });

    expect(view.state.selection.main.from).toBe(4);
    expect(view.state.selection.main.to).toBe(8);
  });
});
