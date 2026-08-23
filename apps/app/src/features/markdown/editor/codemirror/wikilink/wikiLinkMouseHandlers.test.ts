// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { wikiLinkDecorations } from './wikiLinkDecorations';
import { handleWikiLinkClick } from './wikiLinkMouseHandlers';
import type { ResolveWikiLink } from './wikiLinkResolution';

/**
 * Exercises handleWikiLinkClick directly with an explicit position, not
 * via posAtCoords/synthetic coordinates — see the comment on that function
 * for why: jsdom does not implement the text-layout geometry
 * (`Range.getClientRects`) posAtCoords depends on at all.
 */
function mountView(doc: string, resolver?: ResolveWikiLink): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), wikiLinkDecorations(() => resolver)],
  });
  return new EditorView({ state, parent });
}

describe('handleWikiLinkClick', () => {
  it('a plain click on an at-rest WikiLink activates it', () => {
    const activate = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', displayLabel: 'X', activate });
    const view = mountView('Text before [[Projects/Page]]', resolver);
    const nodeFrom = 'Text before '.length;

    const handled = handleWikiLinkClick(view, nodeFrom + 3, false, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('Alt-click on an at-rest WikiLink activates it the same as a plain click — no special engage behavior', () => {
    const activate = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', displayLabel: 'X', activate });
    const view = mountView('Text before [[Projects/Page]]', resolver);
    const nodeFrom = 'Text before '.length;

    const handled = handleWikiLinkClick(view, nodeFrom + 3, true, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('a click that is not on any WikiLink is not handled, letting CM6 fall through to default behavior', () => {
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', displayLabel: 'X', activate: vi.fn() });
    const view = mountView('Text before [[Projects/Page]]', resolver);

    const handled = handleWikiLinkClick(view, 2, false, () => resolver);

    expect(handled).toBe(false);
  });

  it('clicking an already-engaged WikiLink is not handled — it is just ordinary text at that point', () => {
    const activate = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', displayLabel: 'X', activate });
    const view = mountView('Text before [[Projects/Page]]', resolver);
    const nodeFrom = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeFrom + 3 } }); // engage it first
    const handled = handleWikiLinkClick(view, nodeFrom + 3, false, () => resolver);

    expect(handled).toBe(false);
    expect(activate).not.toHaveBeenCalled();
  });

  it('falls back to the raw path when no resolver is provided, still activates without throwing', () => {
    const view = mountView('Text before [[Projects/Page]]');
    const nodeFrom = 'Text before '.length;

    expect(() => handleWikiLinkClick(view, nodeFrom + 2, false, () => undefined)).not.toThrow();
  });
});
