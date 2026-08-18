// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { wikiLinkDecorations } from './wikiLinkDecorations';
import { wikiLinkSelectionSnap } from './wikiLinkSelectionSnap';
import type { ResolveWikiLink } from './wikiLinkResolution';

function mountView(doc: string, resolver?: ResolveWikiLink): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      markdownLanguageExtension(),
      wikiLinkDecorations(() => resolver),
      wikiLinkSelectionSnap(),
    ],
  });
  return new EditorView({ state, parent });
}

const resolvedAs = (displayLabel: string): ResolveWikiLink => () => ({
  status: 'resolved',
  displayLabel,
  activate: vi.fn(),
});

describe('wikiLinkSelectionSnap — the one gap native atomicRanges genuinely leaves', () => {
  it('a selection endpoint landing strictly inside an at-rest WikiLink snaps to the nearer boundary', () => {
    // "x [[Projects/Page]] y" -- node spans [2, 19). Endpoint at 5 is
    // strictly inside, closer to 2 than to 19.
    const view = mountView('x [[Projects/Page]] y', resolvedAs('X'));

    view.dispatch({ selection: { anchor: 0, head: 5 } });

    expect(view.state.selection.main.to).toBe(2);
  });

  it('snaps to the far boundary when the inside endpoint is closer to it', () => {
    // node = [2, 19) (17 characters: `[[Projects/Page]]`, confirmed by
    // explicit count, not assumed). 18 is inside, closer to 19 than to 2.
    const view = mountView('x [[Projects/Page]] y', resolvedAs('X'));

    view.dispatch({ selection: { anchor: 21, head: 18 } });

    expect(view.state.selection.main.from).toBe(19);
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

  it('never applies to a document-changing transaction — scoped to pure selection changes only', () => {
    const view = mountView('x [[Projects/Page]] y', resolvedAs('X'));

    // Insert text at position 5 (strictly inside the node) — this is a
    // doc change, not a selection-only transaction; the snap must not
    // interfere with it or corrupt the edit.
    view.dispatch({ changes: { from: 5, insert: '!' } });

    expect(view.state.doc.toString()).toBe('x [[P!rojects/Page]] y');
  });

  it('an already-engaged WikiLink is never snapped — it is just ordinary text at that point', () => {
    const view = mountView('x [[Projects/Page]] y', resolvedAs('X'));
    view.dispatch({ selection: { anchor: 5 } }); // engage it first

    // A selection entirely within the now-engaged (ordinary text) node
    // should behave like ordinary text selection, untouched by this rule.
    view.dispatch({ selection: { anchor: 4, head: 8 } });

    expect(view.state.selection.main.from).toBe(4);
    expect(view.state.selection.main.to).toBe(8);
  });
});
