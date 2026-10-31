// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CONVERGENCE_DURATION_MS, CONVERGENCE_MAX_STAGGERED, CONVERGENCE_STAGGER_MS, startConvergence } from './dragConvergence';
import { installFrameClock, stubReducedMotion } from './dragConvergence.testSupport';

let clock: ReturnType<typeof installFrameClock>;
const reads: string[] = [];

/** A stand-in for the drag session: a live pointer, and the listeners told when it moves. */
function session(x: number, y: number) {
  const listeners = new Set<() => void>();
  const pointer = { x, y };
  return {
    pointer,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    move(nx: number, ny: number) {
      pointer.x = nx;
      pointer.y = ny;
      listeners.forEach((listener) => listener());
    },
    listening: () => listeners.size,
  };
}

function rectOf(name: string, left: number, top: number, width: number, height: number) {
  return () => {
    reads.push(name);
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
  };
}

function item(name: string, left: number, top: number, width = 100, height = 40): HTMLElement {
  const element = document.createElement('div');
  element.dataset.name = name;
  document.body.append(element);
  element.getBoundingClientRect = rectOf(name, left, top, width, height);
  return element;
}

beforeEach(() => {
  clock = installFrameClock();
  reads.length = 0;
  stubReducedMotion(false);
});
afterEach(() => {
  clock.uninstall();
  document.body.replaceChildren();
});

/** Where an item is drawn now, relative to where it started. */
const offsetOf = (element: HTMLElement) => {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(element.style.transform);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 };
};
/** The item's drawn centre. */
const drawn = (element: HTMLElement, from: { x: number; y: number }) => ({ x: from.x + offsetOf(element).x, y: from.y + offsetOf(element).y });
const FULL = CONVERGENCE_DURATION_MS + CONVERGENCE_MAX_STAGGERED * CONVERGENCE_STAGGER_MS + 32;

describe('converging on the cursor (the ghost), not on the card that was pressed', () => {
  it('flies each item to the pointer — a grid, a list or table rows alike — and fades it out on arrival', () => {
    const a = item('a', 0, 0); // centre (50, 20)
    const b = item('b', 300, 400); // centre (350, 420)
    const drag = session(700, 500);
    startConvergence([a, b], drag);

    clock.step(FULL);

    expect(drawn(a, { x: 50, y: 20 })).toEqual({ x: 700, y: 500 });
    expect(drawn(b, { x: 350, y: 420 })).toEqual({ x: 700, y: 500 });
    expect(a.style.opacity).toBe('0');
  });

  it('follows a pointer that moves while it is flying and after it has arrived', () => {
    const a = item('a', 0, 0);
    const drag = session(100, 100);
    startConvergence([a], drag);

    clock.step(80); // mid-flight
    drag.move(600, 300);
    clock.step(FULL); // …and well past the end

    expect(drawn(a, { x: 50, y: 20 })).toEqual({ x: 600, y: 300 });

    drag.move(20, 700); // arrived, and the pointer keeps going
    clock.step(16);
    expect(drawn(a, { x: 50, y: 20 })).toEqual({ x: 20, y: 700 });
  });

  it('is aimed at the ghost\'s own position: the cursor need not be its centre', () => {
    const a = item('a', 0, 0);
    const ghost = document.createElement('div');
    // The ghost's centre is (300, 150) while the pointer is at (280, 120): offset (20, 30).
    ghost.getBoundingClientRect = rectOf('ghost', 250, 130, 100, 40);
    const drag = session(280, 120);
    startConvergence([a], drag, ghost);

    clock.step(FULL);
    expect(drawn(a, { x: 50, y: 20 })).toEqual({ x: 300, y: 150 });

    drag.move(400, 200);
    clock.step(16);
    expect(drawn(a, { x: 50, y: 20 })).toEqual({ x: 420, y: 230 });
  });

  it('reads every bound once, before it writes anything — never while the pointer moves', () => {
    const drag = session(10, 10);
    startConvergence([item('a', 0, 0), item('b', 0, 50)], drag);
    const afterStart = reads.length;

    drag.move(200, 200);
    clock.step(FULL);
    drag.move(300, 300);
    clock.step(32);

    expect(reads).toEqual(['a', 'b']);
    expect(reads).toHaveLength(afterStart);
  });

  it('is eased and restrained: no scaling or rotation, and it fades only near the end', () => {
    const a = item('a', 0, 0);
    startConvergence([a], session(500, 500));

    clock.step(32);
    expect(a.style.transform).not.toMatch(/scale|rotate/);
    expect(a.style.opacity).toBe('1');
    const early = offsetOf(a);
    expect(early.x).toBeGreaterThan(0);
    expect(early.x).toBeLessThan(225); // eases in: well short of half-way in the first frames
  });

  it('staggers the flights slightly, and never more than a handful of steps for a large selection', () => {
    const others = Array.from({ length: 40 }, (_, i) => item(`o${i}`, 0, 50 * (i + 1)));
    startConvergence(others, session(900, 900));

    clock.step(16);
    const started = others.filter((element) => offsetOf(element).x !== 0).length;
    expect(started).toBeLessThan(40); // the later ones have not begun
    clock.step(CONVERGENCE_DURATION_MS + CONVERGENCE_MAX_STAGGERED * CONVERGENCE_STAGGER_MS + 16);
    expect(others.every((element) => element.style.opacity === '0')).toBe(true); // all done within the cap
  });

  it('with reduced motion only fades: nothing travels', () => {
    stubReducedMotion(true);
    const a = item('a', 0, 0);
    startConvergence([a], session(700, 500));

    clock.step(FULL);

    expect(a.style.transform).toBe('');
    expect(a.style.opacity).toBe('0');
  });

  it('does nothing for items that are not mounted, or for nobody', () => {
    const gone = item('gone', 0, 0);
    gone.remove();

    const none = startConvergence([gone], session(0, 0));
    none.revert();
    none.commit();

    expect(clock.pending()).toBe(0);
  });
});

describe('revert — each item returns to ITS OWN original place, from where it is now', () => {
  it('flies back from the current drawn position to the exact start, and leaves nothing on the element', () => {
    const a = item('a', 0, 0);
    a.style.transform = 'rotate(0deg)';
    const b = item('b', 300, 400);
    const drag = session(700, 500);
    const convergence = startConvergence([a, b], drag);

    clock.step(FULL);
    drag.move(900, 100); // the cursor moves on before the cancel
    clock.step(32);
    const atCancel = drawn(a, { x: 50, y: 20 });
    expect(atCancel).toEqual({ x: 900, y: 100 });

    convergence.revert();
    clock.step(CONVERGENCE_DURATION_MS / 2);
    const midway = drawn(a, { x: 50, y: 20 });
    expect(midway.x).toBeLessThan(900); // on its way back…
    expect(midway.x).toBeGreaterThan(50); // …not there yet
    clock.step(CONVERGENCE_DURATION_MS);

    // Its own origin — not the other item's, and not the cursor's.
    expect(a.style.transform).toBe('rotate(0deg)'); // what the element had itself, put back
    expect(a.style.opacity).toBe('');
    expect(b.style.transform).toBe('');
    expect(clock.pending()).toBe(0);
  });

  it('does not follow the pointer once reverting', () => {
    const a = item('a', 0, 0);
    const drag = session(700, 500);
    const convergence = startConvergence([a], drag);
    clock.step(FULL);

    convergence.revert();
    expect(drag.listening()).toBe(0);
    drag.move(5, 5);
    clock.step(16);
    // Still heading back from (700, 500), unaffected by the new pointer position.
    expect(drawn(a, { x: 50, y: 20 }).x).toBeGreaterThan(400);
  });

  it('works from mid-flight: it returns from wherever the flight had got to', () => {
    const a = item('a', 0, 0);
    const convergence = startConvergence([a], session(700, 500));

    clock.step(64);
    const before = offsetOf(a);
    convergence.revert();
    clock.step(48);

    const after = offsetOf(a);
    expect(after.x).toBeLessThan(before.x);
    expect(after.x).toBeGreaterThanOrEqual(0);
    clock.step(CONVERGENCE_DURATION_MS * 2);
    expect(a.style.transform).toBe('');
  });

  it('is safe to call twice, and a commit or dispose after it changes nothing more', () => {
    const a = item('a', 0, 0);
    const convergence = startConvergence([a], session(300, 300));
    clock.step(FULL);

    convergence.revert();
    convergence.revert();
    convergence.commit();
    clock.step(CONVERGENCE_DURATION_MS * 2);

    expect(a.style.transform).toBe('');
    expect(a.style.opacity).toBe('');
  });
});

describe('commit — a drop that moved or reordered', () => {
  it('leaves the items where they are (no snap back) until the collection has rendered, then clears them', () => {
    const a = item('a', 0, 0);
    const drag = session(700, 500);
    const convergence = startConvergence([a], drag);
    clock.step(FULL);

    convergence.commit();
    expect(drag.listening()).toBe(0);
    expect(drawn(a, { x: 50, y: 20 })).toEqual({ x: 700, y: 500 }); // not moved back

    clock.step(16);
    expect(a.style.opacity).toBe('0'); // the next frame has not rendered yet: still held
    clock.step(48);
    expect(a.style.transform).toBe('');
    expect(a.style.opacity).toBe('');
  });

  it('never plays back', () => {
    const a = item('a', 0, 0);
    const convergence = startConvergence([a], session(700, 500));
    clock.step(FULL);

    convergence.commit();
    clock.step(CONVERGENCE_DURATION_MS * 2);

    expect(a.style.transform).toBe('');
  });
});

describe('dispose', () => {
  it('clears everything at once, stops following, and queues nothing', () => {
    const a = item('a', 0, 0);
    const drag = session(700, 500);
    const convergence = startConvergence([a], drag);
    clock.step(64);

    convergence.dispose();

    expect(a.style.transform).toBe('');
    expect(a.style.opacity).toBe('');
    expect(drag.listening()).toBe(0);
    expect(clock.pending()).toBe(0);
  });
});
