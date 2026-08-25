// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createInlineLivePreviewParticipants } from '../highlight/inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from '../highlight/inlineLivePreviewRegion';
import { markdownLanguageExtension } from '../markdownLanguage';
import { tagSelectionSnap } from './tagSelectionSnap';
import type { ResolveTag } from './tagResolution';

function mountView(doc: string, resolver?: ResolveTag): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      markdownLanguageExtension(),
      inlineLivePreviewRegion(
        createInlineLivePreviewParticipants({
          resolveWikiLink: () => undefined,
          resolveTag: () => resolver,
          resolveDate: () => undefined,
        })
      ),
      tagSelectionSnap(),
    ],
  });
  return new EditorView({ state, parent });
}

const resolvedTag = (): ResolveTag => () => ({ status: 'resolved', displayLabel: 'project', activate: vi.fn() });

describe('tagSelectionSnap — the one gap native atomicRanges genuinely leaves', () => {
  it('a selection endpoint landing strictly inside an at-rest Tag snaps to the nearer boundary', () => {
    // "x #project y" -- node spans [2, 10). Endpoint at 4 is strictly
    // inside, closer to 2 than to 10.
    const view = mountView('x #project y', resolvedTag());

    view.dispatch({ selection: { anchor: 0, head: 4 } });

    expect(view.state.selection.main.to).toBe(2);
  });

  it('snaps to the far boundary when the inside endpoint is closer to it', () => {
    const view = mountView('x #project y', resolvedTag());

    view.dispatch({ selection: { anchor: 12, head: 9 } });

    expect(view.state.selection.main.from).toBe(10);
  });

  it('does not touch a selection that spans fully across the node from outside to outside', () => {
    const view = mountView('x #project y', resolvedTag());

    view.dispatch({ selection: { anchor: 0, head: 12 } });

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(12);
  });

  it('never applies to a document-changing transaction', () => {
    const view = mountView('x #project y', resolvedTag());

    view.dispatch({ changes: { from: 4, insert: '!' } });

    expect(view.state.doc.toString()).toBe('x #p!roject y');
  });

  it('an already-engaged Tag is never snapped — it is just ordinary text at that point', () => {
    const view = mountView('x #project y', resolvedTag());
    view.dispatch({ selection: { anchor: 5 } }); // engage it first

    view.dispatch({ selection: { anchor: 4, head: 8 } });

    expect(view.state.selection.main.from).toBe(4);
    expect(view.state.selection.main.to).toBe(8);
  });
});
