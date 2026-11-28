// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { inlinePreviewExtensions } from '../highlight/inlineLivePreviewRegion';
import { markdownLanguageExtension } from '../markdownLanguage';
import type { ResolveWikiLink } from './wikiLinkResolution';

function mountView(doc: string, resolver?: ResolveWikiLink): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      markdownLanguageExtension(),
      inlinePreviewExtensions({ resolveWikiLink: () => resolver }),
    ],
  });
  return new EditorView({ state, parent });
}

const resolvedAs = (displayLabel: string): ResolveWikiLink => () => ({
  status: 'resolved', pageId: 'page-1', icon: 'note', emoji: null,
  displayLabel,
  activate: vi.fn(),
});

describe('WikiLink selection — production inline extensions leave selection to CodeMirror', () => {
  it('preserves an explicitly dispatched selection endpoint inside an at-rest token', () => {
    const view = mountView('x [[Projects/Page]] y', resolvedAs('X'));

    view.dispatch({ selection: { anchor: 0, head: 5 } });

    expect(view.state.selection.main.to).toBe(5);
  });

  it('preserves a reverse selection endpoint near the far boundary', () => {
    const view = mountView('x [[Projects/Page]] y', resolvedAs('X'));

    view.dispatch({ selection: { anchor: 21, head: 18 } });

    expect(view.state.selection.main.from).toBe(18);
  });

  it('does not touch a selection that spans fully across the node from outside to outside (already correct natively)', () => {
    const view = mountView('x [[Projects/Page]] y', resolvedAs('X'));

    view.dispatch({ selection: { anchor: 0, head: 21 } });

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(21);
  });

  it('does not touch a selection with both endpoints already outside the node', () => {
    const view = mountView('x [[Projects/Page]] y', resolvedAs('X'));

    view.dispatch({ selection: { anchor: 0, head: 1 } });

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(1);
  });

  it('does not touch a caret exactly at a boundary — that is engagement, a different rule entirely', () => {
    const view = mountView('x [[Projects/Page]] y', resolvedAs('X'));

    view.dispatch({ selection: { anchor: 2 } });

    expect(view.state.selection.main.head).toBe(2);
  });

  it('does not interfere with a document-changing transaction — scoped to pure selection changes only', () => {
    const view = mountView('x [[Projects/Page]] y', resolvedAs('X'));

    // Insert text at position 5 (strictly inside the node) — this is a
    // doc change, not a selection-only transaction; selection handling must not corrupt the edit.
    view.dispatch({ changes: { from: 5, insert: '!' } });

    expect(view.state.doc.toString()).toBe('x [[P!rojects/Page]] y');
  });

  it('an already-engaged WikiLink keeps the requested selection — it is just ordinary text at that point', () => {
    const view = mountView('x [[Projects/Page]] y', resolvedAs('X'));
    view.dispatch({ selection: { anchor: 5 } }); // engage it first

    // A selection entirely within the now-engaged (ordinary text) node
    // should behave like ordinary text selection, untouched by a custom selection filter.
    view.dispatch({ selection: { anchor: 4, head: 8 } });

    expect(view.state.selection.main.from).toBe(4);
    expect(view.state.selection.main.to).toBe(8);
  });
});
