// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createInlineLivePreviewParticipants } from '../highlight/inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from '../highlight/inlineLivePreviewRegion';
import { markdownLanguageExtension } from '../markdownLanguage';
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
    extensions: [
      markdownLanguageExtension(),
      inlineLivePreviewRegion(
        createInlineLivePreviewParticipants({
          resolveWikiLink: () => resolver,
          resolveTag: () => undefined,
          resolveDate: () => undefined,
        })
      ),
    ],
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

// Regression: clicking an empty/whitespace-only WikiLink must not
// create-and-open a page (activate() previously ran through resolveWikiLink's
// ordinary `unresolved` branch with an empty title). Not handled at all —
// falls through to CM6's own default click-to-position-cursor, which is what
// lets reactivateOnEnteringEmptyReference (wikiLinkAutocomplete.ts) pick it
// up and offer autocomplete instead.
describe('handleWikiLinkClick — empty/whitespace-only WikiLink is never navigable', () => {
  it('clicking [[]] is not handled — no activation, no page creation', () => {
    const create = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'unresolved', displayLabel: '', activate: create });
    const view = mountView('Text before [[]]', resolver);
    const nodeFrom = 'Text before '.length;

    const handled = handleWikiLinkClick(view, nodeFrom + 1, false, () => resolver);

    expect(handled).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('clicking [[ ]] (a literal space) is likewise not handled', () => {
    const create = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'unresolved', displayLabel: '', activate: create });
    const view = mountView('Text before [[ ]]', resolver);
    const nodeFrom = 'Text before '.length;

    const handled = handleWikiLinkClick(view, nodeFrom + 1, false, () => resolver);

    expect(handled).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('the resolver is never even consulted for an empty path — the guard short-circuits before resolution', () => {
    const resolver = vi.fn<ResolveWikiLink>(() => ({ status: 'unresolved', displayLabel: '', activate: vi.fn() }));
    const view = mountView('Text before [[]]', resolver);
    const nodeFrom = 'Text before '.length;

    handleWikiLinkClick(view, nodeFrom + 1, false, () => resolver);

    expect(resolver).not.toHaveBeenCalled();
  });

  it('a normal, non-empty [[Page]] click continues to activate exactly as before — the guard only affects the empty/whitespace-only case', () => {
    const activate = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', displayLabel: 'X', activate });
    const view = mountView('Text before [[Projects/Page]]', resolver);
    const nodeFrom = 'Text before '.length;

    const handled = handleWikiLinkClick(view, nodeFrom + 3, false, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });
});
