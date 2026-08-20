// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { dateDecorations } from './dateDecorations';
import { dateSelectionSnap } from './dateSelectionSnap';
import type { ResolveDate } from './dateResolution';

function mountView(doc: string, resolver?: ResolveDate): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), dateDecorations(() => resolver), dateSelectionSnap()],
  });
  return new EditorView({ state, parent });
}

const resolved = (): ResolveDate => () => ({ activate: vi.fn() });

describe('dateSelectionSnap — the one gap native atomicRanges genuinely leaves', () => {
  it('a selection endpoint landing strictly inside an at-rest Date snaps to the nearer boundary', () => {
    // "x @2026-08-20 y" -- node spans [2, 13). Endpoint at 4 is strictly
    // inside, closer to 2 than to 13.
    const view = mountView('x @2026-08-20 y', resolved());

    view.dispatch({ selection: { anchor: 0, head: 4 } });

    expect(view.state.selection.main.to).toBe(2);
  });

  it('snaps to the far boundary when the inside endpoint is closer to it', () => {
    const view = mountView('x @2026-08-20 y', resolved());

    view.dispatch({ selection: { anchor: 15, head: 12 } });

    expect(view.state.selection.main.from).toBe(13);
  });

  it('does not touch a selection that spans fully across the node from outside to outside', () => {
    const view = mountView('x @2026-08-20 y', resolved());

    view.dispatch({ selection: { anchor: 0, head: 15 } });

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(15);
  });

  it('never applies to a document-changing transaction', () => {
    const view = mountView('x @2026-08-20 y', resolved());

    view.dispatch({ changes: { from: 4, insert: '!' } });

    expect(view.state.doc.toString()).toBe('x @2!026-08-20 y');
  });

  it('an already-engaged Date is never snapped', () => {
    const view = mountView('x @2026-08-20 y', resolved());
    view.dispatch({ selection: { anchor: 5 } }); // engage it first

    view.dispatch({ selection: { anchor: 4, head: 8 } });

    expect(view.state.selection.main.from).toBe(4);
    expect(view.state.selection.main.to).toBe(8);
  });
});
