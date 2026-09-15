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
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', icon: 'note', emoji: null, displayLabel: 'X', activate });
    const view = mountView('Text before [[Projects/Page]]', resolver);
    const nodeFrom = 'Text before '.length;

    const handled = handleWikiLinkClick(view, nodeFrom + 3, false, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('Alt-click on an at-rest WikiLink activates it the same as a plain click — no special engage behavior', () => {
    const activate = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', icon: 'note', emoji: null, displayLabel: 'X', activate });
    const view = mountView('Text before [[Projects/Page]]', resolver);
    const nodeFrom = 'Text before '.length;

    const handled = handleWikiLinkClick(view, nodeFrom + 3, true, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('a click that is not on any WikiLink is not handled, letting CM6 fall through to default behavior', () => {
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', icon: 'note', emoji: null, displayLabel: 'X', activate: vi.fn() });
    const view = mountView('Text before [[Projects/Page]]', resolver);

    const handled = handleWikiLinkClick(view, 2, false, () => resolver);

    expect(handled).toBe(false);
  });

  it('clicking an already-engaged WikiLink is not handled — it is just ordinary text at that point', () => {
    const activate = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', icon: 'note', emoji: null, displayLabel: 'X', activate });
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

// Regression: a WikiLink nested inside an enclosing delimited-mark
// construct (StrongEmphasis/Strikethrough/Highlight/Emphasis/InlineCode)
// must decline to activate when the cursor is engaging that *enclosing*
// construct, even though the click itself lands inside the WikiLink's own
// (narrower) node range — not just when the cursor sits directly inside
// the WikiLink's own range, which the "already-engaged" test above already
// covers. Before this fix, `findAtRestTokenAt` checked only the WikiLink's
// bare node range, so `**[[Page]]**` rendered as raw/editable text (per
// wikiLinkLivePreview.ts's own, independently-widened engagement check)
// while a click anywhere inside the still-visible `[[Page]]` text
// incorrectly activated navigation instead of just placing the caret.
describe('handleWikiLinkClick — cursor inside an enclosing formatting construct but outside the WikiLink itself', () => {
  it('does not activate a click inside the WikiLink text when the selection sits between the ** and the [[', () => {
    const activate = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', icon: 'note', emoji: null, displayLabel: 'X', activate });
    const doc = '**[[Projects/Page]]**';
    const view = mountView(doc, resolver);

    // Selection between "**" and "[[" — inside StrongEmphasis, outside
    // WikiLink's own node range entirely.
    view.dispatch({ selection: { anchor: 2 } });

    // Click lands well inside the WikiLink's own text ("Page"), not at
    // either boundary.
    const clickPos = doc.indexOf('Page') + 2;
    const handled = handleWikiLinkClick(view, clickPos, false, () => resolver);

    expect(handled).toBe(false);
    expect(activate).not.toHaveBeenCalled();
  });

  it('does not activate through a Strikethrough ancestor either — the guard is generic, not WikiLink/StrongEmphasis-specific', () => {
    const activate = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', icon: 'note', emoji: null, displayLabel: 'X', activate });
    const doc = '~~[[Projects/Page]]~~';
    const view = mountView(doc, resolver);

    view.dispatch({ selection: { anchor: 1 } }); // inside the "~~", outside the WikiLink
    const clickPos = doc.indexOf('Page') + 2;
    const handled = handleWikiLinkClick(view, clickPos, false, () => resolver);

    expect(handled).toBe(false);
    expect(activate).not.toHaveBeenCalled();
  });

  it('still activates a click on the same nested WikiLink when the selection is elsewhere entirely — the guard only fires while genuinely editing', () => {
    const activate = vi.fn();
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', icon: 'note', emoji: null, displayLabel: 'X', activate });
    const doc = 'Before **[[Projects/Page]]** after';
    const view = mountView(doc, resolver);

    view.dispatch({ selection: { anchor: 0 } }); // nowhere near the construct
    const clickPos = doc.indexOf('Page') + 2;
    const handled = handleWikiLinkClick(view, clickPos, false, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
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
    const resolver: ResolveWikiLink = () => ({ status: 'resolved', icon: 'note', emoji: null, displayLabel: 'X', activate });
    const view = mountView('Text before [[Projects/Page]]', resolver);
    const nodeFrom = 'Text before '.length;

    const handled = handleWikiLinkClick(view, nodeFrom + 3, false, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });
});
