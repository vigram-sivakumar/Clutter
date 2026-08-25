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
});
