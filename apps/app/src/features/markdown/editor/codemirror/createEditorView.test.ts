// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { EditorView } from '@codemirror/view';

import { createEditorView } from './createEditorView';

describe('createEditorView — initial cursor position', () => {
  it('places a collapsed selection at doc.length, not position 0', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const view = createEditorView({ doc: 'Hello, world', parent });

    expect(view.state.selection.main.anchor).toBe(view.state.doc.length);
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    expect(view.state.selection.main.empty).toBe(true);
  });

  it('places the cursor at 0 for an empty document — doc.length is still the correct end position', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);

    const view = createEditorView({ doc: '', parent });

    expect(view.state.selection.main.anchor).toBe(0);
  });
});

/**
 * Regression coverage for a real bug: with no keymap binding Enter at all,
 * a real Enter keydown had nothing to dispatch to. In a browser this fell
 * through to contentEditable's own native paragraph-split handling, which
 * CM6 then had to reconcile via DOM-mutation observation — the actual
 * source of the double-newline and stuck-until-refocus symptoms. jsdom
 * implements no such native contentEditable fallback, so these tests
 * dispatch a genuine `keydown` at `view.contentDOM` (not a direct command
 * call) — the same path a real keypress takes — and would have seen zero
 * newlines inserted before `keymap.of(defaultKeymap)` was added.
 */
describe('createEditorView — Enter key, via a real keydown dispatch', () => {
  function mountView(doc: string): EditorView {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    return createEditorView({ doc, parent });
  }

  function pressEnter(view: EditorView): void {
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
  }

  it('inserts exactly one newline, not zero or two', () => {
    const view = mountView('hello');
    view.dispatch({ selection: { anchor: 5 } });

    pressEnter(view);

    expect(view.state.doc.toString()).toBe('hello\n');
    expect(view.state.selection.main.head).toBe(6);
  });

  it('two separate Enter presses insert exactly two newlines, not four', () => {
    const view = mountView('hello');
    view.dispatch({ selection: { anchor: 5 } });

    pressEnter(view);
    pressEnter(view);

    expect(view.state.doc.toString()).toBe('hello\n\n');
  });
});
