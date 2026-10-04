// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import {
  applyMediaWidth,
  cancelPendingDimensionTransitions,
  flipDimensionTransition,
  type ResizeObserverHolder,
} from './mediaLayoutStyle';

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

/**
 * Regression coverage for a real, confirmed bug: `.cm-image-container`
 * stuck permanently at an inline `height: 400px` (Fill's own fixed
 * height) after switching to Fit, which should rely on `height: auto`.
 * Root cause: `flipDimensionTransition` only ever cleaned up its own
 * inline pin on `transitionend`. A transition that gets *interrupted* —
 * this function called again for the same element/property before the
 * first call's transition finishes, e.g. a second mode toggle inside the
 * 160ms window — never fires `transitionend` for the interrupted one;
 * per the CSS Transitions spec, an interrupted transition fires
 * `transitioncancel` instead. The interrupted call's own cleanup closure
 * therefore never ran, leaking its listener forever and — critically —
 * leaving whatever inline value it last wrote in place. Once any switch
 * fails to clean up, every later switch's own `getBoundingClientRect()`
 * measurement reads that stale inline value as the element's *actual*
 * current size, which can make a later, otherwise-genuine size change
 * measure as "unchanged" (under this function's own `0.5`px threshold)
 * — permanently skipping the property and leaving the stale value stuck
 * for good. Fixed by also listening for `transitioncancel`, running the
 * exact same cleanup either way.
 */
describe('flipDimensionTransition — cleanup fires on transitioncancel, not only transitionend', () => {
  function fire(el: HTMLElement, type: 'transitionend' | 'transitioncancel', propertyName: string): void {
    el.dispatchEvent(new TransitionEvent(type, { propertyName }));
  }

  it('a normal, uninterrupted transition still cleans up on transitionend (baseline, unchanged)', () => {
    const el = document.createElement('div');
    flipDimensionTransition([{ el, property: 'height', from: 400, to: 300 }]);
    expect(el.style.height).toBe('300px');

    fire(el, 'transitionend', 'height');
    expect(el.style.height).toBe('');
  });

  it('an interrupted transition cleans up on transitioncancel instead — the actual event a real browser fires when a transition never reaches its own transitionend', () => {
    const el = document.createElement('div');
    flipDimensionTransition([{ el, property: 'height', from: 400, to: 300 }]);
    expect(el.style.height).toBe('300px');

    // No transitionend ever fires for this one (it was interrupted) —
    // only transitioncancel, which must still remove the pin.
    fire(el, 'transitioncancel', 'height');
    expect(el.style.height).toBe('');
  });

  it('reproduces the exact reported bug pre-fix scenario: an interrupted transition that never cleans up poisons a later switch\'s own measurement, permanently stuck at the interrupted value', () => {
    const el = document.createElement('div');

    // First switch: Fill (400) -> Fit (300). Interrupted before its own
    // cleanup ever fires (neither transitionend nor transitioncancel —
    // simulating a call this test never resolves, e.g. because a second
    // switch supersedes it before either event arrives).
    flipDimensionTransition([{ el, property: 'height', from: 400, to: 300 }]);
    expect(el.style.height).toBe('300px');

    // Second switch: Fit (300) -> Fill (400) — a completely ordinary,
    // independent call; nothing about it is itself "interrupted."
    flipDimensionTransition([{ el, property: 'height', from: 300, to: 400 }]);
    expect(el.style.height).toBe('400px');

    // The second (valid) transition completes normally.
    fire(el, 'transitionend', 'height');
    expect(el.style.height).toBe('');

    // A third switch back to Fit must not be poisoned by anything the
    // first, never-cleaned-up call left behind — it measures its own
    // fresh from/to and animates/cleans up exactly as any first switch
    // would.
    flipDimensionTransition([{ el, property: 'height', from: 400, to: 300 }]);
    expect(el.style.height).toBe('300px');
    fire(el, 'transitionend', 'height');
    expect(el.style.height).toBe('');
  });

  it('entries whose from/to are equal are still skipped entirely — no pin, no listener, unaffected by the transitioncancel addition', () => {
    const el = document.createElement('div');
    flipDimensionTransition([{ el, property: 'height', from: 400, to: 400 }]);
    expect(el.style.height).toBe('');
    fire(el, 'transitioncancel', 'height');
    expect(el.style.height).toBe(''); // no-op — nothing was ever pinned
  });
});

/**
 * The first resize drag after a Fit/Fill switch snapped back to the default height. The switch's
 * animation pins an inline height and removes it on `transitionend`, which WebKit doesn't reliably
 * send — so the cleanup stayed armed, and fired on the transition that plays when the NEXT drag ends,
 * stripping the height that drag had just set. A second drag worked because the cleanup was spent.
 */
describe('flipDimensionTransition — a cleanup that never fired cannot strip a size set afterwards', () => {
  function fire(el: HTMLElement, propertyName: string): void {
    el.dispatchEvent(new TransitionEvent('transitionend', { propertyName }));
  }

  it('a late transitionend leaves a height the pin no longer holds alone (the drag\'s height survives)', () => {
    const el = document.createElement('div');
    flipDimensionTransition([{ el, property: 'height', from: 300, to: 400 }]);
    expect(el.style.height).toBe('400px');

    // The pin's own transitionend never came. The user then drags the height to 523px...
    el.style.height = '523px';
    // ...and the transition that plays as that drag ends fires the old listener.
    fire(el, 'height');

    expect(el.style.height).toBe('523px');
  });

  it('releases a pin whose size the browser has rounded (a fractional measured size is still our pin)', () => {
    const el = document.createElement('div');
    flipDimensionTransition([{ el, property: 'height', from: 400, to: 459.328125 }]);

    // A real browser reads this back rounded to three decimals.
    el.style.height = '459.328px';
    fire(el, 'height');

    expect(el.style.height).toBe('');
  });

  it('still releases the pin when it is still the pin (the normal case)', () => {
    const el = document.createElement('div');
    flipDimensionTransition([{ el, property: 'height', from: 300, to: 400 }]);

    fire(el, 'height');

    expect(el.style.height).toBe('');
  });

  it('cancelPendingDimensionTransitions settles right away: the pin is released and the cleanup disarmed', () => {
    const el = document.createElement('div');
    flipDimensionTransition([{ el, property: 'height', from: 300, to: 400 }]);
    expect(el.style.height).toBe('400px');

    cancelPendingDimensionTransitions(el);
    expect(el.style.height).toBe('');

    // Nothing left armed: a size set afterwards survives a late event.
    el.style.height = '523px';
    fire(el, 'height');
    expect(el.style.height).toBe('523px');
  });

  it('cancelPendingDimensionTransitions leaves a size that is no longer the pin alone', () => {
    const el = document.createElement('div');
    flipDimensionTransition([{ el, property: 'height', from: 300, to: 400 }]);
    el.style.height = '523px';

    cancelPendingDimensionTransitions(el);

    expect(el.style.height).toBe('523px');
  });

  it('a new flip supersedes one that never settled, so only the latest cleanup remains', () => {
    const el = document.createElement('div');
    flipDimensionTransition([{ el, property: 'height', from: 300, to: 400 }]);
    flipDimensionTransition([{ el, property: 'height', from: 400, to: 250 }]);
    expect(el.style.height).toBe('250px');

    fire(el, 'height');

    expect(el.style.height).toBe('');
  });

  it('does not disturb a different property pinned on the same element', () => {
    const el = document.createElement('div');
    flipDimensionTransition([
      { el, property: 'height', from: 300, to: 400 },
      { el, property: 'width', from: 500, to: 600 },
    ]);

    fire(el, 'height');

    expect(el.style.height).toBe('');
    expect(el.style.width).toBe('600px');
  });
});

/**
 * Fill -> Fit with a narrower result (689x400 -> 600x400): the width changes, the height doesn't. An
 * image's automatic height follows its width, so with only the width pinned the height grew to 459px
 * and snapped back to 400px. Both dimensions of an animating element are now pinned.
 */
describe('flipDimensionTransition — an unchanged dimension is pinned while its sibling animates', () => {
  function fire(el: HTMLElement, propertyName: string): void {
    el.dispatchEvent(new TransitionEvent('transitionend', { propertyName }));
  }

  it('pins the height at its (unchanged) size while the width animates, and releases both when the width settles', () => {
    const el = document.createElement('div');
    flipDimensionTransition([
      { el, property: 'width', from: 689, to: 600 },
      { el, property: 'height', from: 400, to: 400 },
    ]);

    expect(el.style.width).toBe('600px');
    expect(el.style.height).toBe('400px');

    fire(el, 'width');

    expect(el.style.width).toBe('');
    expect(el.style.height).toBe('');
  });

  it('pins nothing when neither dimension changes', () => {
    const el = document.createElement('div');
    flipDimensionTransition([
      { el, property: 'width', from: 600, to: 600 },
      { el, property: 'height', from: 400, to: 400 },
    ]);

    expect(el.style.width).toBe('');
    expect(el.style.height).toBe('');
  });

  it('leaves the element\'s own transition alone afterwards (the pin is applied with it off, then it is restored)', () => {
    const el = document.createElement('div');
    flipDimensionTransition([{ el, property: 'height', from: 300, to: 400 }]);

    expect(el.style.getPropertyValue('transition')).toBe('');
  });

  it('releases the pins after a short while even if no transition event ever arrives (WebKit)', () => {
    vi.useFakeTimers();
    try {
      const el = document.createElement('div');
      flipDimensionTransition([
        { el, property: 'width', from: 689, to: 600 },
        { el, property: 'height', from: 400, to: 400 },
      ]);
      expect(el.style.width).toBe('600px');

      vi.advanceTimersByTime(700);

      expect(el.style.width).toBe('');
      expect(el.style.height).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('the fallback does not strip a size set in the meantime', () => {
    vi.useFakeTimers();
    try {
      const el = document.createElement('div');
      flipDimensionTransition([{ el, property: 'height', from: 300, to: 400 }]);
      el.style.height = '523px';

      vi.advanceTimersByTime(700);

      expect(el.style.height).toBe('523px');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('flipDimensionTransition — releasing a pin restores what the caller had declared, never clears it', () => {
  function fire(el: HTMLElement, propertyName: string): void {
    el.dispatchEvent(new TransitionEvent('transitionend', { propertyName }));
  }

  it('a saved pixel width declared before the animation is still there after it', () => {
    const el = document.createElement('div');
    el.style.width = '600px'; // the saved width, applied by the caller before the animation
    flipDimensionTransition([{ el, property: 'width', from: 689, to: 600 }]);
    expect(el.style.width).toBe('600px');

    fire(el, 'width');

    expect(el.style.width).toBe('600px');
  });

  it('a saved width declared as a percentage comes back as declared', () => {
    const el = document.createElement('div');
    el.style.width = '55%';
    flipDimensionTransition([{ el, property: 'width', from: 689, to: 376 }]);

    fire(el, 'width');

    expect(el.style.width).toBe('55%');
  });

  it('a saved Fill height declared before the animation survives the cancel and the fallback too', () => {
    vi.useFakeTimers();
    try {
      const el = document.createElement('div');
      el.style.height = '400px';
      flipDimensionTransition([{ el, property: 'height', from: 459, to: 400 }]);
      cancelPendingDimensionTransitions(el);
      expect(el.style.height).toBe('400px');

      flipDimensionTransition([{ el, property: 'height', from: 459, to: 400 }]);
      vi.advanceTimersByTime(700);
      expect(el.style.height).toBe('400px');
    } finally {
      vi.useRealTimers();
    }
  });

  it('with nothing declared, the pin is cleared (as before)', () => {
    const el = document.createElement('div');
    flipDimensionTransition([{ el, property: 'width', from: 689, to: 600 }]);

    fire(el, 'width');

    expect(el.style.width).toBe('');
  });
});

