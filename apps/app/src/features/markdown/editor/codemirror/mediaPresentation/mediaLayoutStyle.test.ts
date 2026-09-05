// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { applyMediaWidth, type ResizeObserverHolder } from './mediaLayoutStyle';

/**
 * Regression coverage for a real, confirmed "ResizeObserver loop completed
 * with undelivered notifications" bug — reproduced live, specifically with
 * an external URL image in Fit mode (a local Vault asset resolves near-
 * instantly and rarely triggers it; a still-loading/decoding network image
 * can repaint at a taller or shorter natural size across several frames,
 * each one changing `view.contentDOM`'s height). This observer's own job
 * is purely width-driven ("keep re-clamped when the *editor's* width
 * changes"), but `ResizeObserver` fires on *any* content-box size change
 * of the observed element — width or height — so a still-settling image's
 * repeated height-only changes kept re-triggering this callback, which
 * *unconditionally* rewrote `target.style.width` every single time
 * regardless of whether the width it cares about had actually changed.
 * That extra, avoidable recurring layout work is what tipped Chrome's
 * loop-detection heuristic. The fix: skip the write when the measured
 * available width is unchanged from the last time this callback wrote
 * anything.
 */

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly callback: () => void;
  target: Element | null = null;
  constructor(callback: () => void) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.target = target;
  }
  unobserve(): void {
    this.target = null;
  }
  disconnect(): void {
    this.target = null;
  }
  fire(): void {
    this.callback();
  }
}
vi.stubGlobal('ResizeObserver', FakeResizeObserver);

function mountView(): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({ doc: '' });
  const view = new EditorView({ state, parent });
  Object.defineProperty(view.contentDOM, 'clientWidth', { value: 1100, configurable: true });
  return view;
}

describe('applyMediaWidth — the editor-width clamp observer only ever acts on a genuine width change', () => {
  it('a notification where the measured available width is unchanged does not rewrite the target style (breaks the height-churn-triggered loop)', () => {
    FakeResizeObserver.instances = [];
    const view = mountView();
    const target = document.createElement('div');
    const holder: ResizeObserverHolder = { current: null };

    applyMediaWidth(target, null, 500, view, holder);
    expect(target.style.width).toBe('500px');

    // Simulate a real browser: the target's own style write above doesn't
    // change `clientWidth` in jsdom, so this mirrors the exact scenario
    // that mattered — `view.contentDOM`'s width component of the
    // notification is unchanged, only its height moved (an image still
    // settling). Mutate the style to prove the callback does NOT touch it.
    target.style.width = '999px';
    const observer = FakeResizeObserver.instances.find((o) => o.target === view.contentDOM);
    expect(observer).toBeDefined();
    observer!.fire();

    expect(target.style.width).toBe('999px'); // untouched — no genuine width change occurred
  });

  it('a notification where the available width genuinely changed still rewrites the target style', () => {
    FakeResizeObserver.instances = [];
    const view = mountView();
    const target = document.createElement('div');
    const holder: ResizeObserverHolder = { current: null };

    applyMediaWidth(target, null, 500, view, holder);
    expect(target.style.width).toBe('500px');

    Object.defineProperty(view.contentDOM, 'clientWidth', { value: 800, configurable: true });
    const observer = FakeResizeObserver.instances.find((o) => o.target === view.contentDOM);
    observer!.fire();

    expect(target.style.width).toBe('500px'); // still fits within the new, smaller available width

    Object.defineProperty(view.contentDOM, 'clientWidth', { value: 300, configurable: true });
    observer!.fire();
    expect(target.style.width).toBe('300px'); // now genuinely re-clamped to the smaller available width
  });

  it('repeated identical notifications never re-touch the style, even after an unrelated external change (the actual loop-trigger pattern: 20 consecutive height-only notifications)', () => {
    FakeResizeObserver.instances = [];
    const view = mountView();
    const target = document.createElement('div');
    const holder: ResizeObserverHolder = { current: null };

    applyMediaWidth(target, null, 500, view, holder);
    const observer = FakeResizeObserver.instances.find((o) => o.target === view.contentDOM)!;

    // An external actor (e.g. this test) sets a different value; if the
    // observer's callback still wrote on every one of the 20 identical-
    // width notifications below, it would stomp this back to '500px'.
    target.style.width = '999px';
    for (let i = 0; i < 20; i++) {
      observer.fire(); // simulates 20 consecutive height-only notifications
    }

    expect(target.style.width).toBe('999px'); // never touched by any of the 20 firings
  });
});
