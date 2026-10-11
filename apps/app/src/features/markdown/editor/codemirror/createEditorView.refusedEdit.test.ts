// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';

import { createEditorView, syncMarkdownIntoView } from './createEditorView';
import { __clearAllCachedEditorHistoryForTests } from './editorHistoryCache';

/**
 * An edit the host would refuse (`commitEdit` throws for an archived page, a moment before `readOnly` has caught
 * up) must never reach the view. `canEdit` is asked live, in the transaction filter, before the edit is applied —
 * so there is nothing to repair afterwards: no document change, no history entry, the selection untouched, however
 * many edits arrive in a row, and whether the edit is typing, undo or redo. (The previous design applied the edit,
 * let the host throw, and undid it in a microtask; with two edits in one task it left the view ahead of the host.)
 */

beforeEach(() => {
  __clearAllCachedEditorHistoryForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mount(
  doc: string,
  canEdit: () => boolean,
  onDocChange: (markdown: string) => void = () => undefined
): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);

  return createEditorView({ doc, parent, canEdit, onDocChange });
}

const type = (view: EditorView, text: string, at = view.state.doc.length) =>
  view.dispatch({
    changes: { from: at, insert: text },
    selection: { anchor: at + text.length },
    userEvent: 'input.type',
  });

describe('createEditorView — an edit the host would refuse', () => {
  it('never changes the document', () => {
    const view = mount('Hello', () => false);

    type(view, '!');

    expect(view.state.doc.toString()).toBe('Hello');
  });

  it('leaves the caret where it was', () => {
    const view = mount('Hello', () => false);
    view.dispatch({ selection: { anchor: 2 } });

    type(view, 'X', 2);

    expect(view.state.doc.toString()).toBe('Hello');
    expect(view.state.selection.main.head).toBe(2);
  });

  it('is never reported to the host as an edit', () => {
    const onDocChange = vi.fn();
    const view = mount('Hello', () => false, onDocChange);

    type(view, '!');

    expect(onDocChange).not.toHaveBeenCalled();
  });

  it('keeps the history of edits the host did accept, and leaves no step for the refused one', () => {
    let allowed = true;
    const accepted: string[] = [];
    const view = mount(
      'Hello',
      () => allowed,
      (markdown) => accepted.push(markdown)
    );
    type(view, ' world');
    expect(undoDepth(view.state)).toBe(1);

    allowed = false;
    type(view, '!!');

    expect(view.state.doc.toString()).toBe('Hello world');
    expect(undoDepth(view.state)).toBe(1);
    expect(redoDepth(view.state)).toBe(0);
    allowed = true;
    undo(view);
    expect(view.state.doc.toString()).toBe('Hello');
    redo(view);
    expect(view.state.doc.toString()).toBe('Hello world');
    expect(accepted[accepted.length - 1]).toBe('Hello world');
  });

  it('refuses several edits in one task: the view stays equal to the host, none is half-applied', () => {
    const view = mount('Hello', () => false);

    type(view, '1');
    type(view, '2');
    type(view, '3', 0);

    expect(view.state.doc.toString()).toBe('Hello');
    expect(undoDepth(view.state)).toBe(0);
  });

  it('is decided per edit, live: edits are accepted again as soon as the host allows them', () => {
    let allowed = false;
    const accepted: string[] = [];
    const view = mount(
      'Hello',
      () => allowed,
      (markdown) => accepted.push(markdown)
    );

    type(view, '1');
    allowed = true;
    type(view, '2');

    expect(view.state.doc.toString()).toBe('Hello2');
    expect(accepted).toEqual(['Hello2']);
  });

  it('refuses undo and redo too, without disturbing the stacks', () => {
    let allowed = true;
    const view = mount('Hello', () => allowed);
    type(view, ' world');
    undo(view);
    expect(view.state.doc.toString()).toBe('Hello');
    expect(redoDepth(view.state)).toBe(1);

    allowed = false;
    redo(view);
    expect(view.state.doc.toString()).toBe('Hello');
    expect(redoDepth(view.state)).toBe(1);

    allowed = true;
    redo(view);
    expect(view.state.doc.toString()).toBe('Hello world');

    allowed = false;
    undo(view);
    expect(view.state.doc.toString()).toBe('Hello world');
    expect(undoDepth(view.state)).toBe(1);
  });

  it('still lets the host realign the view (an external sync is not a user edit)', () => {
    const onDocChange = vi.fn();
    const view = mount('Hello', () => false, onDocChange);

    syncMarkdownIntoView(view, 'Hello, synced');

    expect(view.state.doc.toString()).toBe('Hello, synced');
    expect(onDocChange).not.toHaveBeenCalled();
  });

  it('does nothing when no canEdit is given', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = createEditorView({ doc: 'Hello', parent });

    type(view, '!');

    expect(view.state.doc.toString()).toBe('Hello!');
  });
});
