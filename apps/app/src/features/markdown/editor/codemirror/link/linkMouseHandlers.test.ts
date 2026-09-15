// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

vi.mock('@shared/helpers/openExternalUrl', () => ({
  openExternalUrl: vi.fn(),
}));

import { openExternalUrl } from '@shared/helpers/openExternalUrl';
import { createInlineLivePreviewParticipants } from '../highlight/inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from '../highlight/inlineLivePreviewRegion';
import { markdownLanguageExtension } from '../markdownLanguage';
import { handleLinkClick } from './linkMouseHandlers';

/** Exercises handleLinkClick directly with an explicit position — jsdom has no posAtCoords geometry, same rationale as wikiLinkMouseHandlers.test.ts. */
function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [
      markdownLanguageExtension(),
      inlineLivePreviewRegion(
        createInlineLivePreviewParticipants({
          resolveTag: () => undefined,
          resolveDate: () => undefined,
        })
      ),
    ],
  });
  return new EditorView({ state, parent });
}

describe('handleLinkClick', () => {
  it('a plain click on an at-rest Link opens its URL', () => {
    const mockOpen = vi.mocked(openExternalUrl);
    mockOpen.mockClear();
    const doc = 'before [Google](https://google.com) after';
    const view = mountView(doc);
    const labelInside = doc.indexOf('Google') + 2;

    const handled = handleLinkClick(view, labelInside, false);

    expect(handled).toBe(true);
    expect(mockOpen).toHaveBeenCalledWith('https://google.com');
  });

  it('a click that is not on any Link is not handled, letting CM6 fall through to default behavior', () => {
    const doc = 'before [Google](https://google.com) after';
    const view = mountView(doc);

    const handled = handleLinkClick(view, 2, false);

    expect(handled).toBe(false);
  });

  it('clicking an already-engaged Link is not handled — it is just ordinary text at that point, allowing normal editing', () => {
    const mockOpen = vi.mocked(openExternalUrl);
    mockOpen.mockClear();
    const doc = 'before [Google](https://google.com) after';
    const view = mountView(doc);
    const labelInside = doc.indexOf('Google') + 2;

    view.dispatch({ selection: { anchor: labelInside } }); // engage it first
    const handled = handleLinkClick(view, labelInside, false);

    expect(handled).toBe(false);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('reference-style/shortcut links (no URL child) are not handled — they are not decorated or activated', () => {
    const doc = 'before [Display][reference] after';
    const view = mountView(doc);
    const inside = doc.indexOf('Display') + 2;

    const handled = handleLinkClick(view, inside, false);

    expect(handled).toBe(false);
  });

  it('clicking a URL with a title still opens only the URL portion', () => {
    const mockOpen = vi.mocked(openExternalUrl);
    mockOpen.mockClear();
    const doc = 'before [text](https://example.com "a title") after';
    const view = mountView(doc);
    const labelInside = doc.indexOf('text') + 1;

    handleLinkClick(view, labelInside, false);

    expect(mockOpen).toHaveBeenCalledWith('https://example.com');
  });
});

// Regression: a Link nested inside an enclosing delimited-mark construct
// must decline to open its URL while the cursor is engaging that
// enclosing construct, even though the click lands inside the Link's own
// (narrower) node range — see wikiLinkMouseHandlers.test.ts's identical
// regression block for the shared root cause (findAtRestTokenAt used to
// check only the bare node's own range).
describe('handleLinkClick — cursor inside an enclosing formatting construct but outside the Link itself', () => {
  it('does not open the URL for a click inside the link label when the selection sits between the ** and the [', () => {
    const mockOpen = vi.mocked(openExternalUrl);
    mockOpen.mockClear();
    const doc = '**[Google](https://google.com)**';
    const view = mountView(doc);

    view.dispatch({ selection: { anchor: 1 } }); // inside "**", outside the Link
    const labelInside = doc.indexOf('Google') + 2;
    const handled = handleLinkClick(view, labelInside, false);

    expect(handled).toBe(false);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('still opens the URL when the selection is elsewhere entirely', () => {
    const mockOpen = vi.mocked(openExternalUrl);
    mockOpen.mockClear();
    const doc = 'Before **[Google](https://google.com)** after';
    const view = mountView(doc);

    view.dispatch({ selection: { anchor: 0 } });
    const labelInside = doc.indexOf('Google') + 2;
    const handled = handleLinkClick(view, labelInside, false);

    expect(handled).toBe(true);
    expect(mockOpen).toHaveBeenCalledWith('https://google.com');
  });
});
