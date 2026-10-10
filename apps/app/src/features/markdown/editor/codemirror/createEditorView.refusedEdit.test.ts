// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';

import { createEditorView } from './createEditorView';
import { __clearAllCachedEditorHistoryForTests } from './editorHistoryCache';

/**
 * An edit the host refuses (onDocChange throws — `commitEdit` does for an archived page) must not leave the
 * view holding text the session never accepted. The view recovers by undoing the edit's own changes as an
 * external, non-history transaction; it is not remounted and its history is not reset.
 */

beforeEach(() => {
  __clearAllCachedEditorHistoryForTests();
  // CodeMirror reports an update listener's exception to the console; that is the expected, visible outcome.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mount(
  doc: string,
  onDocChange: (markdown: string) => void
): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);

  return createEditorView({ doc, parent, onDocChange });
}

const type = (view: EditorView, text: string, at = view.state.doc.length) =>
  view.dispatch({
    changes: { from: at, insert: text },
    selection: { anchor: at + text.length },
    userEvent: 'input.type',
  });

/** The recovery runs in a microtask — a CM update listener may not dispatch while the update is in progress. */
const settle = () => Promise.resolve();

describe('createEditorView — a refused edit', () => {
  it('returns the view to the text it had before the refused edit', async () => {
    const view = mount('Hello', () => {
      throw new Error('Cannot edit archived page');
    });

    type(view, '!');
    await settle();

    expect(view.state.doc.toString()).toBe('Hello');
  });

  it('puts the caret back where it was', async () => {
    const view = mount('Hello', () => {
      throw new Error('refused');
    });
    view.dispatch({ selection: { anchor: 2 } });

    type(view, 'X', 2);
    await settle();

    expect(view.state.doc.toString()).toBe('Hello');
    expect(view.state.selection.main.head).toBe(2);
  });

  it('does not report the recovery back to the host as an edit', async () => {
    const onDocChange = vi.fn(() => {
      throw new Error('refused');
    });
    const view = mount('Hello', onDocChange);

    type(view, '!');
    await settle();

    expect(onDocChange).toHaveBeenCalledTimes(1);
  });

  it('keeps the view, and the history of edits the host did accept', async () => {
    let refuse = false;
    const accepted: string[] = [];
    const view = mount('Hello', (markdown) => {
      if (refuse) throw new Error('refused');
      accepted.push(markdown);
    });
    type(view, ' world');
    expect(undoDepth(view.state)).toBe(1);

    refuse = true;
    type(view, '!!');
    await settle();

    expect(view.state.doc.toString()).toBe('Hello world');
    // The accepted edit is still undoable and the document is consistent with what the host holds.
    undo(view);
    expect(view.state.doc.toString()).toBe('Hello');
    redo(view);
    expect(view.state.doc.toString()).toBe('Hello world');
    expect(accepted[accepted.length - 1]).toBe('Hello world');
  });

  it('leaves no phantom undo or redo step for the refused edit', async () => {
    const view = mount('Hello', () => {
      throw new Error('refused');
    });
    type(view, '!');
    await settle();

    // The history mapped the refused edit away completely: nothing to undo, nothing to redo.
    expect(undoDepth(view.state)).toBe(0);
    expect(redoDepth(view.state)).toBe(0);
    undo(view);
    expect(view.state.doc.toString()).toBe('Hello');
  });

  it('is skipped if the document has already moved on by the time it runs', async () => {
    const view = mount('Hello', (markdown) => {
      if (markdown === 'Hello!') throw new Error('refused');
    });

    type(view, '!');
    // Something else changes the document before the recovery's microtask.
    view.dispatch({ changes: { from: 0, insert: '>> ' } });
    await settle();

    expect(view.state.doc.toString()).toBe('>> Hello!');
  });
});
