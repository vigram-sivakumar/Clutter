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

function lineEl(view: EditorView, index: number): HTMLElement {
  const el = Array.from(view.dom.querySelectorAll<HTMLElement>('.cm-line'))[index];
  if (!el) {
    throw new Error(`expected a .cm-line at index ${index}`);
  }
  return el;
}

/** The base class — present in both the `visible` and `fading` stages, absent once fully cleared. */
function hasRevealLine(view: EditorView, index: number): boolean {
  return lineEl(view, index).className.includes('cm-task-reveal-line');
}

/** The `--visible` modifier — present only while the highlighted color itself is showing, not during the fade-out. */
function isVisible(view: EditorView, index: number): boolean {
  return lineEl(view, index).className.includes('cm-task-reveal-line--visible');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('taskRevealHighlight', () => {
  it('marks the line containing the range start, not any other line, with the --visible modifier', () => {
    const view = mountView('first line\nsecond line\nthird line');

    view.dispatch({ effects: setTaskRevealHighlight.of({ from: 12, to: 23 }) });

    expect(hasRevealLine(view, 0)).toBe(false);
    expect(hasRevealLine(view, 1)).toBe(true);
    expect(isVisible(view, 1)).toBe(true);
    expect(hasRevealLine(view, 2)).toBe(false);
  });

  it('never touches the selection', () => {
    const view = mountView('first line\nsecond line');
    view.dispatch({ selection: { anchor: 0 } });

    view.dispatch({ effects: setTaskRevealHighlight.of({ from: 11, to: 22 }) });

    expect(view.state.selection.main.from).toBe(0);
    expect(view.state.selection.main.to).toBe(0);
  });

  it('clears outright via clearTaskRevealHighlight (no fade — a direct, non-timed clear)', () => {
    const view = mountView('only line');
    view.dispatch({ effects: setTaskRevealHighlight.of({ from: 0, to: 4 }) });
    expect(hasRevealLine(view, 0)).toBe(true);

    view.dispatch({ effects: clearTaskRevealHighlight.of(null) });

    expect(hasRevealLine(view, 0)).toBe(false);
  });

  // appear smoothly -> stay visible -> fade out smoothly -> disappear
  // completely. The decoration's own base class (carrying the CSS
  // transition) must still be present through the fade stage — only the
  // `--visible` modifier (the actual color) comes off at the 2.5s mark —
  // and the decoration is only fully discarded once the fade's own
  // duration has elapsed, never at the same instant the fade starts.
  it('fades out (base class stays, --visible is removed) at 2.5s, then fully clears only after the fade finishes', () => {
    vi.useFakeTimers();
    const view = mountView('only line');

    view.dispatch({ effects: setTaskRevealHighlight.of({ from: 0, to: 4 }) });
    expect(hasRevealLine(view, 0)).toBe(true);
    expect(isVisible(view, 0)).toBe(true);

    vi.advanceTimersByTime(2499);
    expect(isVisible(view, 0)).toBe(true);

    // The 2.5s mark: fade-out starts. Decoration must NOT disappear yet —
    // the base class (and its transition) stays so the color can actually
    // animate back to transparent.
    vi.advanceTimersByTime(1);
    expect(hasRevealLine(view, 0)).toBe(true);
    expect(isVisible(view, 0)).toBe(false);

    // Still mid-fade, not yet cleared.
    vi.advanceTimersByTime(399);
    expect(hasRevealLine(view, 0)).toBe(true);

    // The fade's own duration has now elapsed — only now is the
    // decoration actually discarded.
    vi.advanceTimersByTime(1);
    expect(hasRevealLine(view, 0)).toBe(false);
  });

  it('a second reveal restarts the full visible-then-fade window instead of inheriting the first timer', () => {
    vi.useFakeTimers();
    const view = mountView('abc\ndef');

    view.dispatch({ effects: setTaskRevealHighlight.of({ from: 0, to: 2 }) });
    vi.advanceTimersByTime(1500);
    view.dispatch({ effects: setTaskRevealHighlight.of({ from: 4, to: 6 }) });
    vi.advanceTimersByTime(1500);
    // The second reveal's own 2.5s window hasn't elapsed yet (1500 < 2500).
    expect(isVisible(view, 1)).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(isVisible(view, 1)).toBe(false);
    expect(hasRevealLine(view, 1)).toBe(true);

    vi.advanceTimersByTime(400);
    expect(hasRevealLine(view, 1)).toBe(false);
  });

  it('mousedown starts the same smooth fade-out immediately, rather than disappearing instantly', () => {
    vi.useFakeTimers();
    const view = mountView('only line');
    view.dispatch({ effects: setTaskRevealHighlight.of({ from: 0, to: 4 }) });
    expect(isVisible(view, 0)).toBe(true);

    view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    // Faded, not gone: the base class (and its transition) is still there
    // immediately after the click.
    expect(hasRevealLine(view, 0)).toBe(true);
    expect(isVisible(view, 0)).toBe(false);

    // The original 2.5s timer must not independently fire a second,
    // conflicting transition later — only the fade-triggered clear timer
    // (400ms from the click) should still be pending.
    vi.advanceTimersByTime(399);
    expect(hasRevealLine(view, 0)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(hasRevealLine(view, 0)).toBe(false);

    // Advancing well past the original reveal's own 2.5s mark afterward
    // must not resurrect or re-trigger anything.
    vi.advanceTimersByTime(5000);
    expect(hasRevealLine(view, 0)).toBe(false);
  });

  it('a second mousedown during an already-running fade is a no-op (does not restart or extend the fade)', () => {
    vi.useFakeTimers();
    const view = mountView('only line');
    view.dispatch({ effects: setTaskRevealHighlight.of({ from: 0, to: 4 }) });

    view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    vi.advanceTimersByTime(200);
    view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    // If the second click had restarted the fade timer, the decoration
    // would still be present 200ms later (at the 400ms mark from the
    // *first* click); it must already be fully cleared.
    vi.advanceTimersByTime(200);

    expect(hasRevealLine(view, 0)).toBe(false);
  });

  it('a click with no active highlight does nothing — no fade starts, no class appears', () => {
    vi.useFakeTimers();
    const view = mountView('only line');

    view.contentDOM.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    vi.advanceTimersByTime(5000);

    expect(hasRevealLine(view, 0)).toBe(false);
  });
});
