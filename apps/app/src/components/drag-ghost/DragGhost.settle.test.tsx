// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PointerDragSession } from '@shared/interaction';
import { installFrameClock, stubReducedMotion } from '@app/layouts/page/body/dragConvergence.testSupport';

import { DRAG_GHOST_RETURN_MS, DRAG_GHOST_SETTLE_MS, DragGhost } from './DragGhost';

let clock: ReturnType<typeof installFrameClock>;
beforeEach(() => {
  clock = installFrameClock();
  stubReducedMotion(false);
});
afterEach(() => {
  cleanup();
  clock.uninstall();
});

// The original: a card at (100, 200), 300 × 40. The ghost is the compact width (256).
function makeSession(pointer = { x: 150, y: 220 }) {
  const source = document.createElement('div');
  source.setAttribute('data-drag-ghost-size', 'compact');
  source.getBoundingClientRect = () => ({ left: 100, top: 200, width: 300, height: 40, right: 400, bottom: 240, x: 100, y: 200, toJSON: () => ({}) }) as DOMRect;
  document.body.append(source);
  const listeners = new Set<() => void>();
  const session = {
    source,
    snapshot: document.createElement('div'),
    grabOffsetY: 20,
    allowDragOutsideContainer: true,
    pointer: { ...pointer },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as PointerDragSession;
  const move = (x: number, y: number) => {
    (session.pointer as { x: number; y: number }).x = x;
    (session.pointer as { x: number; y: number }).y = y;
    listeners.forEach((listener) => listener());
  };
  return { session, move };
}

const ghost = () => document.querySelector<HTMLElement>('.drag-ghost')!;
const position = () => {
  const match = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(ghost().style.transform)!;
  return { x: Number(match[1]), y: Number(match[2]), width: parseFloat(ghost().style.width) };
};
const advance = (ms: number) => act(() => clock.step(ms));

describe('a ghost that settles onto the cursor', () => {
  it('starts exactly on the original — same place, same width — so nothing jumps when the drag begins', () => {
    const { session } = makeSession();
    render(<DragGhost session={session} settle />);

    expect(position()).toEqual({ x: 100, y: 200, width: 300 });
  });

  it('then settles onto the cursor: centred on it, at the compact width', () => {
    const { session } = makeSession({ x: 600, y: 500 });
    render(<DragGhost session={session} settle />);

    advance(DRAG_GHOST_SETTLE_MS + 32);

    expect(position()).toEqual({ x: 600 - 128, y: 500 - 20, width: 256 });
  });

  it('moves toward the cursor smoothly in between (eased: no jump, no overshoot)', () => {
    const { session } = makeSession({ x: 600, y: 500 });
    render(<DragGhost session={session} settle />);

    advance(48);
    const early = position();
    advance(48);
    const later = position();

    expect(early.x).toBeGreaterThan(100);
    expect(later.x).toBeGreaterThan(early.x);
    expect(later.x).toBeLessThan(472);
    expect(later.width).toBeLessThan(300);
  });

  it('tracks the cursor from the first frame: a pointer that moves mid-settle is followed, and once settled it is exact', () => {
    const { session, move } = makeSession({ x: 600, y: 500 });
    render(<DragGhost session={session} settle />);

    advance(64);
    move(900, 120);
    advance(DRAG_GHOST_SETTLE_MS + 32);
    expect(position()).toEqual({ x: 900 - 128, y: 120 - 20, width: 256 });

    move(40, 700); // settled: every move lands exactly, with no frame needed
    expect(position()).toEqual({ x: 40 - 128, y: 700 - 20, width: 256 });
  });

  it('without `settle` (a single item) the ghost is centred on the cursor at once, as before', () => {
    const { session } = makeSession({ x: 600, y: 500 });
    render(<DragGhost session={session} />);

    expect(position()).toEqual({ x: 472, y: 480, width: 256 });
  });

  it('with reduced motion it is on the cursor at once', () => {
    stubReducedMotion(true);
    const { session } = makeSession({ x: 600, y: 500 });
    render(<DragGhost session={session} settle />);

    expect(position()).toEqual({ x: 472, y: 480, width: 256 });
  });

  it('stops redrawing every frame once settled', () => {
    const { session } = makeSession({ x: 600, y: 500 });
    render(<DragGhost session={session} settle />);

    advance(DRAG_GHOST_SETTLE_MS + 64);

    expect(clock.pending()).toBe(0);
  });
});

describe('a ghost flying back (the drag was cancelled)', () => {
  it('starts where the cursor left it, and lands on the original, then says so', () => {
    const { session } = makeSession({ x: 600, y: 500 });
    const onDone = vi.fn();
    render(<DragGhost session={session} returning={{ onDone }} />);

    expect(position()).toEqual({ x: 472, y: 480, width: 256 }); // the cursor's
    advance(DRAG_GHOST_RETURN_MS / 2);
    expect(onDone).not.toHaveBeenCalled();
    const midway = position();
    expect(midway.x).toBeLessThan(472);
    expect(midway.x).toBeGreaterThan(100);

    advance(DRAG_GHOST_RETURN_MS);
    expect(position()).toEqual({ x: 100, y: 200, width: 300 }); // the original's own place and size
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(clock.pending()).toBe(0);
  });

  it('with reduced motion it is done at once', () => {
    stubReducedMotion(true);
    const { session } = makeSession();
    const onDone = vi.fn();
    render(<DragGhost session={session} returning={{ onDone }} />);

    expect(onDone).toHaveBeenCalled();
  });

  it('unmounting mid-flight leaves no frame queued', () => {
    const { session } = makeSession({ x: 600, y: 500 });
    const { unmount } = render(<DragGhost session={session} returning={{ onDone: () => undefined }} />);

    advance(48);
    unmount();

    expect(clock.pending()).toBe(0);
  });
});
