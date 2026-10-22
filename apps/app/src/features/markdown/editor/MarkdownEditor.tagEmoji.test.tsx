// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';

import { MarkdownEditor } from './MarkdownEditor';
import type { ResolveTag } from './codemirror/tag/tagResolution';
import { __clearAllCachedEditorHistoryForTests } from './codemirror/editorHistoryCache';
import { readShowTagEmojis, writeShowTagEmojis } from '@shared/helpers/showTagEmojisPreference';

/**
 * The Show tag emojis setting reaches an OPEN editor: changing it rebuilds the inline decorations, so tag references
 * switch between the emoji and the `#` at once, without a re-mount or a restart. The host's resolver applies the setting
 * (resolveTag.ts); this stands in for it by reading the same preference each time a tag is resolved.
 */
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  localStorage.clear();
  __clearAllCachedEditorHistoryForTests();
});
afterEach(cleanup);

const resolveTag: ResolveTag = (name) => ({
  status: 'resolved',
  displayLabel: name,
  ...(readShowTagEmojis() && name === 'design' ? { icon: '📦' } : {}),
  activate: () => {},
});

const prefixes = (container: HTMLElement) =>
  [...container.querySelectorAll('.tok-tag .tok-tag-prefix')].map((el) => el.textContent);

describe('MarkdownEditor — Show tag emojis', () => {
  it('on by default: a tag reference shows its emoji, and one without an emoji shows `#`', () => {
    const { container } = render(<MarkdownEditor pageId="p" markdown={'see #design and #plain here'} resolveTag={resolveTag} />);

    expect(prefixes(container)).toEqual(['📦', '#']);
  });

  it('turning the setting off, then on, updates the open editor at once, with the same view', () => {
    const { container } = render(<MarkdownEditor pageId="p" markdown={'see #design and #plain here'} resolveTag={resolveTag} />);
    const view = EditorView.findFromDOM(container)!;

    act(() => writeShowTagEmojis(false));
    expect(prefixes(container)).toEqual(['#', '#']);
    expect(container.querySelector('.tok-tag-prefix--emoji')).toBeNull();

    act(() => writeShowTagEmojis(true));
    expect(prefixes(container)).toEqual(['📦', '#']);
    expect(EditorView.findFromDOM(container)).toBe(view);
  });

  it('never rewrites the note: the document keeps its `#design` either way', () => {
    const { container } = render(<MarkdownEditor pageId="p" markdown={'see #design here'} resolveTag={resolveTag} />);
    const view = EditorView.findFromDOM(container)!;

    act(() => writeShowTagEmojis(false));

    expect(view.state.doc.toString()).toBe('see #design here');
  });
});

describe('MarkdownEditor — tagResolutionRevision', () => {
  // A resolver whose emoji can change without the note changing (the tag's emoji edited elsewhere).
  const icons: Record<string, string | undefined> = {};
  const live: ResolveTag = (name) => ({
    status: 'resolved',
    displayLabel: name,
    ...(readShowTagEmojis() && icons[name] ? { icon: icons[name] } : {}),
    activate: () => {},
  });
  const editor = (revision: unknown) => (
    <MarkdownEditor pageId="p" markdown={'see #design and #design here'} resolveTag={live} tagResolutionRevision={revision} />
  );

  it('redraws every open tag reference when the revision changes, in the same view, keeping caret and text', () => {
    icons.design = '📦';
    const { container, rerender } = render(editor('r1'));
    const view = EditorView.findFromDOM(container)!;
    act(() => view.dispatch({ selection: { anchor: 1 } }));
    expect(prefixes(container)).toEqual(['📦', '📦']);

    icons.design = '🚀';
    rerender(editor('r2'));

    expect(prefixes(container)).toEqual(['🚀', '🚀']);
    expect(EditorView.findFromDOM(container)).toBe(view);
    expect(view.state.selection.main.anchor).toBe(1);
    expect(view.state.doc.toString()).toBe('see #design and #design here');
  });

  it('does nothing when the revision is unchanged: decorations only follow edits and refresh signals', () => {
    icons.design = '📦';
    const { container, rerender } = render(editor('r1'));

    icons.design = '🚀';
    rerender(editor('r1'));

    expect(prefixes(container)).toEqual(['📦', '📦']);
  });

  it('with Show tag emojis off, a changed emoji never makes one visible', () => {
    writeShowTagEmojis(false);
    icons.design = '📦';
    const { container, rerender } = render(editor('r1'));

    icons.design = '🚀';
    rerender(editor('r2'));

    expect(prefixes(container)).toEqual(['#', '#']);
  });
});

