// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { clearTaskRevealHighlight, setTaskRevealHighlight, taskRevealHighlight } from './taskRevealHighlight';

function mountView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({ doc, extensions: [taskRevealHighlight()] });
  return new EditorView({ state, parent });
}

function lines(view: EditorView): HTMLElement[] {
  return Array.from(view.dom.querySelectorAll('.cm-line'));
}

function hasRevealLine(view: EditorView, index: number): boolean {
  return (lines(view)[index]?.className ?? '').includes('cm-task-reveal-line');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('taskRevealHighlight', () => {
  it('marks the line containing the range start, not any other line', () => {
    const view = mountView('first line\nsecond line\nthird line');

    view.dispatch({ effects: setTaskRevealHighlight.of({ from: 12, to: 23 }) });

    expect(hasRevealLine(view, 0)).toBe(false);
    expect(hasRevealLine(view, 1)).toBe(true);
    expect(hasRevealLine(view, 2)).toBe(false);
  });

  it('never touches the selection', () => {
    const view = mountView('first line\nsecond line');
    view.dispatch({ selection: { anchor: 0 } });

    view.dispatch({ effects: setTaskRevealHighlight.of({ from: 11, to: 22 }) });

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(0);
  });

  it('clears via clearTaskRevealHighlight', () => {
    const view = mountView('only line');
    view.dispatch({ effects: setTaskRevealHighlight.of({ from: 0, to: 4 }) });
    expect(hasRevealLine(view, 0)).toBe(true);

    view.dispatch({ effects: clearTaskRevealHighlight.of(null) });

    expect(hasRevealLine(view, 0)).toBe(false);
  });

  it('auto-clears after 3 seconds', () => {
    vi.useFakeTimers();
    const view = mountView('only line');

    view.dispatch({ effects: setTaskRevealHighlight.of({ from: 0, to: 4 }) });
    expect(hasRevealLine(view, 0)).toBe(true);

    vi.advanceTimersByTime(2999);
    expect(hasRevealLine(view, 0)).toBe(true);

    vi.advanceTimersByTime(1);
    expect(hasRevealLine(view, 0)).toBe(false);
  });

  it('a second reveal restarts the 3-second window instead of inheriting the first timer', () => {
    vi.useFakeTimers();
    const view = mountView('abc\ndef');

    view.dispatch({ effects: setTaskRevealHighlight.of({ from: 0, to: 2 }) });
    vi.advanceTimersByTime(2000);
    view.dispatch({ effects: setTaskRevealHighlight.of({ from: 4, to: 6 }) });
    vi.advanceTimersByTime(2000);
    expect(hasRevealLine(view, 1)).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(hasRevealLine(view, 1)).toBe(false);
  });

  it('clears immediately on mousedown inside the editor, before the 3-second timer', () => {
    vi.useFakeTimers();
    const view = mountView('only line');
    view.dispatch({ effects: setTaskRevealHighlight.of({ from: 0, to: 4 }) });
    expect(hasRevealLine(view, 0)).toBe(true);

    view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(hasRevealLine(view, 0)).toBe(false);
    // The timer from the original reveal must not fire a second, harmless
    // clear later — this only confirms clicking didn't leave a stray timer
    // around that could interact badly with a later reveal.
    vi.advanceTimersByTime(3000);
    expect(hasRevealLine(view, 0)).toBe(false);
  });

  it('a click with no active highlight never dispatches a clearTaskRevealHighlight effect, and normal click-to-position handling is untouched', () => {
    const view = mountView('only line');
    const dispatchSpy = vi.spyOn(view, 'dispatch');

    view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    const dispatchedClearEffect = dispatchSpy.mock.calls.some(([spec]) => {
      const effects = (spec as { effects?: unknown }).effects;
      const list = Array.isArray(effects) ? effects : effects ? [effects] : [];
      return list.some((effect) => (effect as ReturnType<typeof clearTaskRevealHighlight.of>).is(clearTaskRevealHighlight));
    });
    expect(dispatchedClearEffect).toBe(false);
    // CM6's own click-to-position handling still ran, untouched by this extension.
    expect(dispatchSpy).toHaveBeenCalled();
  });
});
