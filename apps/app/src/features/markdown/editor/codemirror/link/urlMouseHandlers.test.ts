// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

vi.mock('@shared/helpers/openExternalUrl', () => ({
  openExternalUrl: vi.fn(),
}));

import { openExternalUrl } from '@shared/helpers/openExternalUrl';
import { markdownLanguageExtension } from '../markdownLanguage';
import { handleUrlClick } from './urlMouseHandlers';

function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension()],
  });
  return new EditorView({ state, parent });
}

describe('handleUrlClick', () => {
  it('a plain click on an at-rest bare URL opens it', () => {
    const mockOpen = vi.mocked(openExternalUrl);
    mockOpen.mockClear();
    const doc = 'before https://example.com/a?b=1 after';
    const view = mountView(doc);
    const inside = doc.indexOf('example');

    const handled = handleUrlClick(view, inside, false);

    expect(handled).toBe(true);
    expect(mockOpen).toHaveBeenCalledWith('https://example.com/a?b=1');
  });

  it("a plain click on an at-rest Autolink's URL text opens it", () => {
    const mockOpen = vi.mocked(openExternalUrl);
    mockOpen.mockClear();
    const doc = 'before <https://example.com/a> after';
    const view = mountView(doc);
    const inside = doc.indexOf('example');

    const handled = handleUrlClick(view, inside, false);

    expect(handled).toBe(true);
    expect(mockOpen).toHaveBeenCalledWith('https://example.com/a');
  });

  it('a click that is not on any URL is not handled', () => {
    const doc = 'before https://example.com/a after';
    const view = mountView(doc);

    const handled = handleUrlClick(view, 2, false);

    expect(handled).toBe(false);
  });

  it('clicking an already-engaged bare URL is not handled — ordinary text editing applies', () => {
    const mockOpen = vi.mocked(openExternalUrl);
    mockOpen.mockClear();
    const doc = 'before https://example.com/a after';
    const view = mountView(doc);
    const inside = doc.indexOf('example');

    view.dispatch({ selection: { anchor: inside } });
    const handled = handleUrlClick(view, inside, false);

    expect(handled).toBe(false);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("an explicit Link's inner URL is not double-handled by the bare-URL handler at the label position", () => {
    const doc = 'before [Google](https://google.com) after';
    const view = mountView(doc);
    const labelInside = doc.indexOf('Google') + 2;

    const handled = handleUrlClick(view, labelInside, false);

    expect(handled).toBe(false);
  });

  it("does NOT open an Image's own URL when clicked — its revealed raw source is plain text, not a link", () => {
    // "Image source URL must remain plain text while editing" (2026-09-02):
    // clicking inside `![alt](url)`'s own URL substring must never
    // navigate — the whole point of a revealed image's raw Markdown is
    // that it's ordinary, directly-editable text. This mirrors
    // inlineLivePreviewParticipants.ts's own `urlRenderer` guard on the
    // styling side, but exercises the independent click-handling path
    // (getUrlActivation), which that guard never touched.
    const mockOpen = vi.mocked(openExternalUrl);
    mockOpen.mockClear();
    const doc = '![alt](https://example.com/image.jpg)';
    const view = mountView(doc);
    const inside = doc.indexOf('example');

    const handled = handleUrlClick(view, inside, false);

    expect(handled).toBe(false);
    expect(mockOpen).not.toHaveBeenCalled();
  });
});

// Regression: an Autolink/bare URL nested inside an enclosing
// delimited-mark construct must decline to open while the cursor is
// engaging that enclosing construct — see wikiLinkMouseHandlers.test.ts's
// identical regression block for the shared root cause.
describe('handleUrlClick — cursor inside an enclosing formatting construct but outside the URL/Autolink itself', () => {
  it('does not open an Autolink when the selection sits between the ** and the <', () => {
    const mockOpen = vi.mocked(openExternalUrl);
    mockOpen.mockClear();
    const doc = '**<https://example.com/a>**';
    const view = mountView(doc);

    view.dispatch({ selection: { anchor: 1 } }); // inside "**", outside the Autolink
    const inside = doc.indexOf('example');
    const handled = handleUrlClick(view, inside, false);

    expect(handled).toBe(false);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('does not open a bare URL when the selection sits inside an enclosing Strikethrough', () => {
    const mockOpen = vi.mocked(openExternalUrl);
    mockOpen.mockClear();
    const doc = '~~https://example.com/a~~';
    const view = mountView(doc);

    view.dispatch({ selection: { anchor: 1 } }); // inside "~~", outside the URL
    const inside = doc.indexOf('example');
    const handled = handleUrlClick(view, inside, false);

    expect(handled).toBe(false);
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('still opens the Autolink when the selection is elsewhere entirely', () => {
    const mockOpen = vi.mocked(openExternalUrl);
    mockOpen.mockClear();
    const doc = 'Before **<https://example.com/a>** after';
    const view = mountView(doc);

    view.dispatch({ selection: { anchor: 0 } });
    const inside = doc.indexOf('example');
    const handled = handleUrlClick(view, inside, false);

    expect(handled).toBe(true);
    expect(mockOpen).toHaveBeenCalledWith('https://example.com/a');
  });
});
