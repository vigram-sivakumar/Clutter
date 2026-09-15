// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createInlineLivePreviewParticipants } from '../highlight/inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from '../highlight/inlineLivePreviewRegion';
import { markdownLanguageExtension } from '../markdownLanguage';
import { handleTagClick } from './tagMouseHandlers';
import type { ResolveTag } from './tagResolution';

/** Exercises handleTagClick directly with an explicit position — jsdom has no posAtCoords geometry, same rationale as wikiLinkMouseHandlers.test.ts. */
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
    ],
  });
  return new EditorView({ state, parent });
}

describe('handleTagClick', () => {
  it('a plain click on an at-rest Tag activates it', () => {
    const activate = vi.fn();
    const resolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'project', activate });
    const view = mountView('Text before #project', resolver);
    const nodeFrom = 'Text before '.length;

    const handled = handleTagClick(view, nodeFrom + 3, false, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('Alt-click on an at-rest Tag activates it the same as a plain click — no special engage behavior', () => {
    const activate = vi.fn();
    const resolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'project', activate });
    const view = mountView('Text before #project', resolver);
    const nodeFrom = 'Text before '.length;

    const handled = handleTagClick(view, nodeFrom + 3, true, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('a click that is not on any Tag is not handled, letting CM6 fall through to default behavior', () => {
    const resolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'project', activate: vi.fn() });
    const view = mountView('Text before #project', resolver);

    const handled = handleTagClick(view, 2, false, () => resolver);

    expect(handled).toBe(false);
  });

  it('clicking an already-engaged Tag is not handled — it is just ordinary text at that point', () => {
    const activate = vi.fn();
    const resolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'project', activate });
    const view = mountView('Text before #project', resolver);
    const nodeFrom = 'Text before '.length;

    view.dispatch({ selection: { anchor: nodeFrom + 3 } }); // engage it first
    const handled = handleTagClick(view, nodeFrom + 3, false, () => resolver);

    expect(handled).toBe(false);
    expect(activate).not.toHaveBeenCalled();
  });

  it('falls back to unresolved when no resolver is provided, still activates without throwing', () => {
    const view = mountView('Text before #project');
    const nodeFrom = 'Text before '.length;

    expect(() => handleTagClick(view, nodeFrom + 2, false, () => undefined)).not.toThrow();
  });
});

// Regression: a Tag nested inside an enclosing delimited-mark construct
// must decline to activate while the cursor is engaging that enclosing
// construct — see wikiLinkMouseHandlers.test.ts's identical regression
// block for the shared root cause (findAtRestTokenAt used to check only
// the bare node's own range).
describe('handleTagClick — cursor inside an enclosing formatting construct but outside the Tag itself', () => {
  // "x " keeps a valid tag-preceding context (a `#` must be preceded by
  // whitespace/line-start, isValidTagPrecedingContext) while also keeping
  // "**" left-flanking (CommonMark requires the character right after an
  // opening "**" to be non-whitespace) — same doc shape
  // inlineLivePreviewRegion.test.ts's own Tag/StrongEmphasis composition
  // tests already use for the identical reason.
  it('does not activate a click inside the tag text when the selection sits between the ** and the #', () => {
    const activate = vi.fn();
    const resolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'project', activate });
    const doc = '**x #project**';
    const view = mountView(doc, resolver);

    view.dispatch({ selection: { anchor: 1 } }); // inside "**x ", outside the Tag
    const clickPos = doc.indexOf('project') + 2;
    const handled = handleTagClick(view, clickPos, false, () => resolver);

    expect(handled).toBe(false);
    expect(activate).not.toHaveBeenCalled();
  });

  it('still activates when the selection is elsewhere entirely', () => {
    const activate = vi.fn();
    const resolver: ResolveTag = () => ({ status: 'resolved', displayLabel: 'project', activate });
    const doc = 'Before **x #project** after';
    const view = mountView(doc, resolver);

    view.dispatch({ selection: { anchor: 0 } });
    const clickPos = doc.indexOf('project') + 2;
    const handled = handleTagClick(view, clickPos, false, () => resolver);

    expect(handled).toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
  });
});
