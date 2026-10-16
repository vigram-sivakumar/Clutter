// @vitest-environment jsdom

import { createRef } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { redo, undo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';

import { MarkdownEditor } from './MarkdownEditor';
import type { MarkdownEditorHandle } from './MarkdownEditor.types';
import { __clearAllCachedEditorHistoryForTests } from './codemirror/editorHistoryCache';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => __clearAllCachedEditorHistoryForTests());
afterEach(cleanup);

function mount(initial: string) {
  const ref = createRef<MarkdownEditorHandle>();
  const onEdit = vi.fn();
  const { container } = render(<MarkdownEditor ref={ref} pageId="page" markdown={initial} onEdit={onEdit} />);
  const view = EditorView.findFromDOM(container as unknown as HTMLElement)!;

  return { handle: ref.current!, view, onEdit };
}

describe('insertSeparatorAtStart', () => {
  it('puts a literal --- line at the start, leaves the rest alone, and reports the edit', () => {
    const { handle, view, onEdit } = mount('Hello\n\nWorld');

    handle.insertSeparatorAtStart();

    expect(view.state.doc.toString()).toBe('---\nHello\n\nWorld');
    expect(onEdit).toHaveBeenLastCalledWith('---\nHello\n\nWorld');
  });

  it('is idempotent: a body that already starts with a rule gets no second one', () => {
    const { handle, view } = mount('---\nHello');

    handle.insertSeparatorAtStart();
    handle.insertSeparatorAtStart();

    expect(view.state.doc.toString()).toBe('---\nHello');
  });

  it('an empty body gets the rule, once', () => {
    const { handle, view } = mount('');

    handle.insertSeparatorAtStart();
    handle.insertSeparatorAtStart();

    expect(view.state.doc.toString()).toBe('---\n');
  });

  it('keeps the caret with its text, and is one undoable step', () => {
    const { handle, view } = mount('Hello');
    view.dispatch({ selection: { anchor: 0 } });

    handle.insertSeparatorAtStart();
    expect(view.state.selection.main.head).toBe(4);

    undo(view);
    expect(view.state.doc.toString()).toBe('Hello');
    redo(view);
    expect(view.state.doc.toString()).toBe('---\nHello');
  });

  it('a user who deletes it keeps it deleted — nothing reinserts it by itself', () => {
    const { handle, view } = mount('Hello');
    handle.insertSeparatorAtStart();

    view.dispatch({ changes: { from: 0, to: 4 }, userEvent: 'delete' });

    expect(view.state.doc.toString()).toBe('Hello');
  });
});
