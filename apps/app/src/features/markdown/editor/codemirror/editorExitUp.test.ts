// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { keymap } from '@codemirror/view';

import { editorExitUp, type EditorExitUp } from './editorExitUp';

const mounted: EditorView[] = [];

afterEach(() => {
  for (const view of mounted.splice(0)) {
    view.destroy();
  }
});

function mount(doc: string, pos: number, exit: EditorExitUp | undefined, selectionTo?: number) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: selectionTo === undefined ? EditorSelection.cursor(pos) : EditorSelection.range(pos, selectionTo),
      extensions: [editorExitUp(() => exit), keymap.of(defaultKeymap)],
    }),
    parent,
  });
  mounted.push(view);
  return view;
}

function pressArrowUp(view: EditorView, init: KeyboardEventInit = {}): boolean {
  return runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'ArrowUp', ...init }), 'editor');
}

describe('editorExitUp', () => {
  it('hands the caret to the region above when ArrowUp is pressed on the first line', () => {
    const exit = vi.fn(() => true);
    const view = mount('first\nsecond', 3, exit);

    expect(pressArrowUp(view)).toBe(true);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('works from an empty editor', () => {
    const exit = vi.fn(() => true);

    expect(pressArrowUp(mount('', 0, exit))).toBe(true);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('declines on any line below the first, leaving normal vertical movement to the default keymap', () => {
    const exit = vi.fn(() => true);
    const view = mount('first\nsecond', 8, exit);

    pressArrowUp(view);

    expect(exit).not.toHaveBeenCalled();
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(1);
  });

  it('declines with a non-empty selection', () => {
    const exit = vi.fn(() => true);

    pressArrowUp(mount('first\nsecond', 1, exit, 3));

    expect(exit).not.toHaveBeenCalled();
  });

  it('falls through to the default ArrowUp when there is no region above (the callback reports false)', () => {
    const exit = vi.fn(() => false);
    const view = mount('first\nsecond', 3, exit);

    expect(pressArrowUp(view)).toBe(true); // handled by the default keymap, not swallowed
    expect(exit).toHaveBeenCalledTimes(1);
    expect(view.state.selection.main.head).toBe(0); // cursorLineUp's own first-line behaviour
  });

  it('declines when no exit is supplied at all', () => {
    const view = mount('first', 3, undefined);

    expect(() => pressArrowUp(view)).not.toThrow();
  });

  it('does not intercept a modified ArrowUp (Shift extends the selection)', () => {
    const exit = vi.fn(() => true);

    pressArrowUp(mount('first', 3, exit), { shiftKey: true });

    expect(exit).not.toHaveBeenCalled();
  });
});
