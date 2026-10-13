// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';

import { MarkdownEditor } from '@features/markdown/editor/MarkdownEditor';
import { __clearAllCachedEditorHistoryForTests } from '@features/markdown/editor/codemirror/editorHistoryCache';

import { findHeadingRevealRange, openPageAtHeading } from './headingReveal';
import type { PendingEditorReveal } from './PendingEditorReveal';

beforeEach(() => __clearAllCachedEditorHistoryForTests());
afterEach(() => cleanup());

const MARKDOWN = '# Decisions\n\nWe decided.\n\n## Action Items\n\nDo things.\n\n# Appendix\n\nExtra.\n';

/** The lines the editor currently highlights as a navigation target (as rendered: the heading marker is concealed). */
const revealed = (view: EditorView) =>
  Array.from(view.dom.querySelectorAll('.cm-reveal-line--visible')).map((line) => line.textContent);

/**
 * What PageHost does for a heading link / embed source: `openPageAtHeading` requests a reveal that
 * PageHost narrows to the active page and hands this editor as its `pendingReveal` prop.
 */
function requestFor(heading: string): { ranges: { from: number; to: number }[] } {
  let request: PendingEditorReveal | undefined;
  openPageAtHeading({ open: () => {}, getMarkdown: () => MARKDOWN, requestReveal: (r) => (request = r) }, 'p1', heading);
  return { ranges: [...request!.ranges] };
}

describe('a heading target reaches the editor and is highlighted', () => {
  it('opening the note at a heading highlights exactly that heading’s line, once, with no selection change', () => {
    const onRevealApplied = vi.fn();
    const { container } = render(
      <MarkdownEditor pageId="p1" markdown={MARKDOWN} pendingReveal={requestFor('Action Items')} onRevealApplied={onRevealApplied} />
    );
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;

    expect(revealed(view)).toEqual(['Action Items']);
    expect(onRevealApplied).toHaveBeenCalledTimes(1);
    expect(view.state.selection.main.empty).toBe(true);
  });

  it('with the note already open, a request lands on the heading without remounting the editor', () => {
    const { container, rerender } = render(<MarkdownEditor pageId="p1" markdown={MARKDOWN} />);
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;
    expect(revealed(view)).toEqual([]);

    rerender(<MarkdownEditor pageId="p1" markdown={MARKDOWN} pendingReveal={requestFor('Decisions')} />);

    expect(EditorView.findFromDOM(container as unknown as HTMLElement)).toBe(view);
    expect(revealed(view)).toEqual(['Decisions']);
  });

  it('a second heading after the first highlights the latest target, not the earlier one', () => {
    const { container, rerender } = render(<MarkdownEditor pageId="p1" markdown={MARKDOWN} pendingReveal={requestFor('Decisions')} />);
    const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;
    expect(revealed(view)).toEqual(['Decisions']);

    rerender(<MarkdownEditor pageId="p1" markdown={MARKDOWN} pendingReveal={requestFor('Appendix')} />);

    expect(revealed(view)).toEqual(['Appendix']);
  });

  it('a missing heading produces no request at all, so nothing is highlighted and nothing throws', () => {
    expect(findHeadingRevealRange(MARKDOWN, 'Nope')).toBeNull();
    const { container } = render(<MarkdownEditor pageId="p1" markdown={MARKDOWN} />);

    expect(() => openPageAtHeading({ open: () => {}, getMarkdown: () => MARKDOWN, requestReveal: () => {} }, 'p1', 'Nope')).not.toThrow();
    expect(revealed(EditorView.findFromDOM(container as unknown as HTMLElement)!)).toEqual([]);
  });
});
