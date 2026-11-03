// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { MarkdownEditor } from './MarkdownEditor';
import { __clearAllCachedEditorHistoryForTests } from './codemirror/editorHistoryCache';
import { writeEnableEmojiLists } from '@shared/helpers/enableEmojiListsPreference';

/**
 * The Enable emoji lists setting reaches an OPEN editor. It changes parsing, so the editor is rebuilt through its
 * existing remount path: the document (including unsaved edits), selection and undo history carry over, and
 * nothing is written to the note.
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

const SOURCE = '🚀 Launch plan\n🎨 Design review\n🧪 Testing';
const markers = (container: HTMLElement) =>
  [...container.querySelectorAll('.cm-emoji-list-marker')].map((el) => el.textContent);

describe('MarkdownEditor — Enable emoji lists', () => {
  it('on by default: emoji lines are list items with marker boxes', () => {
    const { container } = render(<MarkdownEditor pageId="p" markdown={SOURCE} />);

    expect(markers(container)).toEqual(['🚀 ', '🎨 ', '🧪 ']);
    expect(container.querySelectorAll('.cm-list-line')).toHaveLength(3);
  });

  it('off at mount: emoji lines are plain text — no marker, no list indent', () => {
    writeEnableEmojiLists(false);
    const { container } = render(<MarkdownEditor pageId="p" markdown={SOURCE} />);

    expect(markers(container)).toEqual([]);
    expect(container.querySelectorAll('.cm-list-line')).toHaveLength(0);
    expect(container.querySelector('.cm-content')?.textContent).toBe(SOURCE.replace(/\n/g, ''));
  });

  it('turning it off, then on, updates the open editor at once and never rewrites the note', () => {
    const edits: string[] = [];
    const { container } = render(<MarkdownEditor pageId="p" markdown={SOURCE} onEdit={(m) => edits.push(m)} />);

    act(() => writeEnableEmojiLists(false));
    expect(markers(container)).toEqual([]);
    expect(container.querySelectorAll('.cm-list-line')).toHaveLength(0);
    expect(EditorView.findFromDOM(container)!.state.doc.toString()).toBe(SOURCE);

    act(() => writeEnableEmojiLists(true));
    expect(markers(container)).toEqual(['🚀 ', '🎨 ', '🧪 ']);
    expect(EditorView.findFromDOM(container)!.state.doc.toString()).toBe(SOURCE);
    expect(edits).toEqual([]);
  });

  it('carries unsaved edits and the selection across the rebuild', () => {
    const { container } = render(<MarkdownEditor pageId="p" markdown={SOURCE} />);
    const before = EditorView.findFromDOM(container)!;
    act(() => {
      before.dispatch({ changes: { from: 0, insert: 'Intro\n\n' }, selection: EditorSelection.cursor(9) });
    });
    const edited = before.state.doc.toString();

    act(() => writeEnableEmojiLists(false));

    const after = EditorView.findFromDOM(container)!;
    expect(after.state.doc.toString()).toBe(edited);
    expect(after.state.selection.main.head).toBe(9);
    expect(markers(container)).toEqual([]);
  });
});
