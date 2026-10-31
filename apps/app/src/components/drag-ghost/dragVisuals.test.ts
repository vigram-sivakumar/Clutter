// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PointerDragSession } from '@shared/interaction';

import { DRAG_SOURCE_ATTRIBUTE, DRAG_VISUAL_POLICY, createDragVisuals, type DragVisuals } from './dragVisuals';
import { installFrameClock, stubReducedMotion } from './dragVisuals.testSupport';

let clock: ReturnType<typeof installFrameClock>;
let restoreMotion: () => void;
let visuals: DragVisuals;

beforeEach(() => {
  clock = installFrameClock();
  restoreMotion = stubReducedMotion(false);
  visuals = createDragVisuals();
});
afterEach(() => {
  visuals.dispose();
  restoreMotion();
  clock.uninstall();
  vi.useRealTimers();
  document.body.replaceChildren();
});

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A rendered item: a bordered, rounded "card" with an id, a role, a focusable button and drag markers inside. */
function item(name: string, rect: Rect): HTMLElement & { moveTo(next: Rect): void } {
  const element = document.createElement('div') as unknown as HTMLElement & { moveTo(next: Rect): void };
  element.id = `item-${name}`;
  element.setAttribute('role', 'button');
  element.setAttribute('tabindex', '0');
  element.dataset.dragId = name;
  element.dataset.dragKind = 'note';
  element.dataset.dragInsideOnly = 'true';
  element.style.border = '1px solid red';
  element.innerHTML = `<button id="inner-${name}">Open ${name}</button><span>${name}</span>`;
  let current = rect;
  element.getBoundingClientRect = () => ({ ...current, right: current.left + current.width, bottom: current.top + current.height, x: current.left, y: current.top, toJSON: () => ({}) }) as DOMRect;
  element.moveTo = (next) => void (current = next);
  document.body.append(element);
  return element;
}

function makeSession(source: HTMLElement, pointer = { x: 500, y: 400 }) {
  const listeners = new Set<() => void>();
  const session = {
    source,
    snapshot: source.cloneNode(true) as HTMLElement,
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
  return { session, move, listening: () => listeners.size };
}

const overlay = () => document.querySelector<HTMLElement>('.drag-visuals');
const clones = () => [...document.querySelectorAll<HTMLElement>('.drag-visuals .drag-ghost')];
const boxOf = (element: HTMLElement) => {
  const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(element.style.transform)!;
  return { x: Number(m[1]), y: Number(m[2]), width: parseFloat(element.style.width), height: parseFloat(element.style.height) };
};
const centreOf = (element: HTMLElement) => {
  const b = boxOf(element);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const advance = (ms: number) => clock.step(ms);
const FULL = 600;

const A = { left: 100, top: 100, width: 300, height: 40 };
const B = { left: 100, top: 200, width: 300, height: 40 };
const C = { left: 100, top: 300, width: 300, height: 40 };

describe('one drag-visual system: starting', () => {
  it('a single item: its original is hidden — kept in the DOM, with no inline style touched — and restored exactly', () => {
    const a = item('a', A);
    a.setAttribute(DRAG_SOURCE_ATTRIBUTE, 'previous'); // whatever it held is what comes back
    const before = a.getAttribute('style');
    const handle = visuals.start(makeSession(a).session);

    expect(a).toHaveAttribute(DRAG_SOURCE_ATTRIBUTE, 'true');
    expect(a.isConnected).toBe(true);
    expect(a.getAttribute('style')).toBe(before);
    expect(clones()).toHaveLength(1);

    handle.cancel();
    advance(FULL);
    expect(a.getAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe('previous');
    expect(a.getAttribute('style')).toBe(before);

    const other = item('b', B);
    const dropped = visuals.start(makeSession(other).session);
    expect(other).toHaveAttribute(DRAG_SOURCE_ATTRIBUTE, 'true');
    dropped.commit();
    advance(FULL);
    expect(other.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
  });

  it('several items: EVERY original stays visible and untouched throughout — only clones move — and a clone of each is drawn in one overlay', () => {
    const [a, b, c] = [item('a', A), item('b', B), item('c', C)] as const;
    const before = [a, b, c].map((el) => el.outerHTML);
    const { session } = makeSession(a, { x: 700, y: 500 });
    const handle = visuals.start(session, [b, c]);

    const untouched = () => {
      for (const el of [a, b, c]) {
        expect(el.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
        expect(el.isConnected).toBe(true);
      }
      expect([a, b, c].map((el) => el.outerHTML)).toEqual(before); // no attribute, style, class or opacity of any kind
    };

    untouched(); // at the start
    expect(document.querySelectorAll('.drag-visuals')).toHaveLength(1);
    expect(clones()).toHaveLength(3);
    expect(document.querySelector('.drag-ghost-count')?.textContent).toBe('3');
    advance(80);
    untouched(); // mid-flight
    advance(FULL);
    untouched(); // converged
    handle.release();
    untouched(); // held
    handle.cancel();
    advance(DRAG_VISUAL_POLICY.returnMs / 2);
    untouched(); // flying back
    advance(FULL);
    untouched(); // restored
    expect(overlay()).toBeNull();
  });

  it('a single item is the same system: one clone, no count', () => {
    const a = item('a', A);

    visuals.start(makeSession(a).session);

    expect(clones()).toHaveLength(1);
    expect(document.querySelector('.drag-ghost-count')).toBeNull();
    expect(a).toHaveAttribute(DRAG_SOURCE_ATTRIBUTE, 'true');
  });

  it('the clones are harmless pictures: inert, hidden from assistive tech, no ids, nothing focusable, no drag markers, out of the pointer\'s way', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    visuals.start(makeSession(a).session, [b]);

    const layer = overlay()!;
    expect(layer).toHaveAttribute('inert');
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    for (const clone of clones()) {
      expect(clone).toHaveAttribute('inert');
      expect(clone).toHaveAttribute('aria-hidden', 'true');
      expect(clone.querySelectorAll('[id]')).toHaveLength(0);
      expect(clone.querySelectorAll('[tabindex], [role]')).toHaveLength(0);
      expect([...clone.querySelectorAll('*'), clone].some((el) => [...el.attributes].some((attr) => attr.name.startsWith('data-drag')))).toBe(false);
    }
    expect(document.querySelectorAll('[id="item-a"]')).toHaveLength(1); // no duplicated id
  });

  it('the lead starts exactly on its original and eases onto the cursor; the others converge on the lead, wherever it is', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    const { session, move } = makeSession(a, { x: 700, y: 500 });
    visuals.start(session, [b]);
    const [lead, other] = clones() as [HTMLElement, HTMLElement];

    expect(boxOf(lead)).toMatchObject({ x: 100, y: 100, width: 300 }); // no jump
    expect(centreOf(other)).toEqual({ x: 250, y: 220 }); // the other has not moved either

    advance(FULL);
    expect(centreOf(lead)).toEqual({ x: 700, y: 500 });
    expect(centreOf(other)).toEqual({ x: 700, y: 500 });
    expect(other.style.opacity).toBe(''); // arrived fully opaque (it faded IN on the way)

    move(300, 650); // the pointer keeps going: the ghost is exact at once, the others follow on the next frame
    expect(centreOf(lead)).toEqual({ x: 300, y: 650 });
    advance(32);
    expect(centreOf(other)).toEqual({ x: 300, y: 650 });
  });

  it('never reads a layout while the pointer moves', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    const { session, move } = makeSession(a);
    visuals.start(session, [b]);
    advance(FULL);
    const reads = vi.spyOn(b, 'getBoundingClientRect');

    for (let i = 0; i < 20; i += 1) move(100 + i, 100 + i);
    advance(64);

    expect(reads).not.toHaveBeenCalled(); // (the lead's own live rect is read for its size — not the others')
  });

  it('an item that is not mounted (virtualised, or gone) is simply not drawn', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    b.remove();

    visuals.start(makeSession(a).session, [b]);

    expect(clones()).toHaveLength(1);
    expect(document.querySelector('.drag-ghost-count')).toBeNull();
  });
});

describe('fading', () => {
  it('every clone is born at opacity 0 and fades in WHILE it moves — the ghost over a visible original too', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    visuals.start(makeSession(a, { x: 700, y: 500 }).session, [b]);
    const [lead, other] = clones() as [HTMLElement, HTMLElement];

    expect(lead.style.opacity).toBe('0');
    expect(other.style.opacity).toBe('0');

    advance(64);
    const moved = Math.hypot(centreOf(other).x - 250, centreOf(other).y - 220);
    const mid = { lead: Number(lead.style.opacity), other: Number(other.style.opacity) };
    expect(mid.lead).toBeGreaterThan(0);
    expect(mid.lead).toBeLessThan(1);
    expect(mid.other).toBeGreaterThan(0);
    expect(mid.other).toBeLessThan(1);
    expect(moved).toBeGreaterThan(1); // moving at the same time

    advance(FULL);
    expect(lead.style.opacity).toBe('');
    expect(other.style.opacity).toBe('');
  });

  it('a single item\'s clone is opaque at once — its original is hidden, so a fade would dip to nothing — and its frame fades in', () => {
    const a = item('a', A);
    visuals.start(makeSession(a).session);

    expect(clones()[0]!.style.opacity).toBe('');
    expect(clones()[0]).toHaveClass('drag-ghost--entering');
  });

  it('cancel: each clone flies back from its CURRENT place and opacity, fading to 0 on the way — never reset first', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
        const handle = visuals.start(makeSession(a, { x: 700, y: 500 }).session, [b]);
    advance(70); // mid-flight: partly moved, partly faded in
    const [lead, other] = clones() as [HTMLElement, HTMLElement];
    const before = { x: centreOf(other).x, y: centreOf(other).y, opacity: Number(other.style.opacity), lead: Number(lead.style.opacity) };

    handle.cancel();
    advance(16);
    // The first frame back continues from where it was: no jump to the start, none to full opacity.
    expect(Math.abs(centreOf(other).x - before.x)).toBeLessThan(40);
    expect(Math.abs(centreOf(other).y - before.y)).toBeLessThan(40);
    expect(Number(other.style.opacity)).toBeLessThanOrEqual(before.opacity + 0.01);
    expect(Number(lead.style.opacity)).toBeLessThanOrEqual(before.lead + 0.01);

    advance(DRAG_VISUAL_POLICY.returnMs / 2);
    expect(Number(other.style.opacity)).toBeLessThan(before.opacity);
    advance(FULL);
    expect(overlay()).toBeNull();
  });

  it('cancel fades a fully-shown ghost from 1 to 0 as it returns, and removes it only when gone', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    const handle = visuals.start(makeSession(a, { x: 700, y: 500 }).session, [b]);
    advance(FULL);

    handle.cancel();
    advance(DRAG_VISUAL_POLICY.returnMs * 0.6);
    const lead = clones()[0]!;
    expect(Number(lead.style.opacity)).toBeGreaterThan(0);
    expect(Number(lead.style.opacity)).toBeLessThan(1);

    advance(FULL);
    expect(overlay()).toBeNull();
  });

  it('a hidden original is shown again while its clone is still fading, so it never pops in', () => {
    const a = item('a', A);
    const handle = visuals.start(makeSession(a, { x: 700, y: 500 }).session);
    advance(FULL);

    handle.cancel();
    advance(DRAG_VISUAL_POLICY.returnMs * 0.5);
    expect(a).toHaveAttribute(DRAG_SOURCE_ATTRIBUTE, 'true'); // not yet
    advance(DRAG_VISUAL_POLICY.returnMs * 0.35);
    expect(a.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false); // back, with the clone still on its way out
    expect(overlay()).not.toBeNull();
    expect(Number(clones()[0]!.style.opacity)).toBeGreaterThan(0);

    advance(FULL);
    expect(overlay()).toBeNull();
  });

  it('cancelling an animation already in progress, then another drag at once, leaves no stale opacity or clone', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    const first = visuals.start(makeSession(a, { x: 700, y: 500 }).session, [b]);
    advance(40);
    first.cancel();
    advance(40);

    const second = visuals.start(makeSession(b).session, [a]);
    expect(document.querySelectorAll('.drag-visuals')).toHaveLength(1);
    expect(clones().every((clone) => clone.style.opacity === '0')).toBe(true); // a fresh start, from nothing

    second.dispose();
    advance(FULL);
    expect(overlay()).toBeNull();
    expect(clock.pending()).toBe(0);
  });

  it('with reduced motion nothing is faded: the ghost is opaque at once and a cancel ends at once', () => {
    restoreMotion();
    restoreMotion = stubReducedMotion(true);
    const [a, b] = [item('a', A), item('b', B)] as const;
    const handle = visuals.start(makeSession(a, { x: 700, y: 500 }).session, [b]);

    expect(clones()[0]!.style.opacity).toBe('');
    handle.cancel();
    expect(overlay()).toBeNull();
  });
});

describe('ending a drag', () => {
  it('cancel: every clone flies back to where its original is NOW — even if the layout moved — then the originals are restored', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    const { session, move, listening } = makeSession(a, { x: 700, y: 500 });
    const handle = visuals.start(session, [b]);
    advance(FULL);
    move(900, 120);
    advance(32);

    handle.cancel();
    expect(listening()).toBe(0); // no longer follows the pointer
    b.moveTo({ left: 100, top: 400, width: 300, height: 40 }); // the collection re-laid-out while it flew
    advance(DRAG_VISUAL_POLICY.returnMs / 2);
    const [lead, other] = clones() as [HTMLElement, HTMLElement];
    expect(centreOf(other).y).toBeGreaterThan(220); // on its way…
    expect(centreOf(other).y).toBeLessThan(500);

    advance(FULL);
    expect(overlay()).toBeNull(); // clones gone
    expect(a.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
    expect(b.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
    expect(lead.isConnected).toBe(false);
    expect(clock.pending()).toBe(0);
  });

  it('cancel from mid-flight returns from where the clones had got to', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    visuals.start(makeSession(a, { x: 700, y: 500 }).session, [b]).cancel();
    advance(48);

    expect(overlay()).not.toBeNull();
    advance(FULL);
    expect(overlay()).toBeNull();
  });

  it('commit: nothing flies back — the clones fade out where the cursor left them, then go with the hiding', () => {
    const a = item('a', A);
    const { session } = makeSession(a, { x: 700, y: 500 });
    const handle = visuals.start(session);
    advance(FULL);
    handle.release();
    const where = centreOf(clones()[0]!);

    handle.commit();
    advance(32);
    expect(overlay()).not.toBeNull(); // not before the collection has rendered: neither a duplicate nor a gap
    expect(a).toHaveAttribute(DRAG_SOURCE_ATTRIBUTE, 'true');
    expect(centreOf(clones()[0]!)).toEqual(where); // in place — no flight back
    const fading = Number(clones()[0]!.style.opacity);
    expect(fading).toBeLessThan(1);
    expect(fading).toBeGreaterThan(0);

    advance(FULL);
    expect(overlay()).toBeNull();
    expect(a.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
    expect(clock.pending()).toBe(0);
  });

  it('commit of several items: the originals stay as they were, only the clones fade out', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    const before = [a, b].map((el) => el.outerHTML);
    const handle = visuals.start(makeSession(a, { x: 700, y: 500 }).session, [b]);
    advance(FULL);

    handle.commit();
    advance(32);
    expect([a, b].map((el) => el.outerHTML)).toEqual(before);
    expect(clones().every((clone) => Number(clone.style.opacity || 1) < 1)).toBe(true);
    advance(FULL);

    expect(overlay()).toBeNull();
    expect([a, b].map((el) => el.outerHTML)).toEqual(before);
  });

  it('release holds the clones where they are while the drop is decided', () => {
    const a = item('a', A);
    const { session, move } = makeSession(a, { x: 700, y: 500 });
    const handle = visuals.start(session);
    advance(FULL);

    handle.release();
    move(10, 10);

    expect(centreOf(clones()[0]!)).toEqual({ x: 700, y: 500 });
  });

  it('is idempotent: any number of cancels, commits, disposes — in any order — leave one clean result', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    const handle = visuals.start(makeSession(a).session, [b]);

    handle.cancel();
    handle.cancel();
    handle.commit();
    handle.release();
    handle.dispose();
    handle.dispose();
    visuals.dispose();
    advance(FULL);

    expect(overlay()).toBeNull();
    expect(a.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
    expect(b.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
    expect(clock.pending()).toBe(0);
  });

  it('a new drag ends the last one at once — even one still flying back — and the old handle can no longer touch anything', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    const first = visuals.start(makeSession(a, { x: 700, y: 500 }).session, [b]);
    advance(FULL);
    first.cancel();
    advance(40);

    const second = visuals.start(makeSession(b).session);
    expect(document.querySelectorAll('.drag-visuals')).toHaveLength(1); // the first drag's clones are gone
    expect(clones()).toHaveLength(1);
    expect(b).toHaveAttribute(DRAG_SOURCE_ATTRIBUTE, 'true'); // a single item: hidden

    first.cancel(); // stale
    first.commit();
    first.dispose();
    advance(FULL);
    expect(document.querySelectorAll('.drag-visuals')).toHaveLength(1);
    expect(b).toHaveAttribute(DRAG_SOURCE_ATTRIBUTE, 'true');

    second.dispose();
    expect(overlay()).toBeNull();
  });

  it('disposing (the page going away) removes everything, with no frame left queued', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    const { session, listening } = makeSession(a, { x: 700, y: 500 });
    visuals.start(session, [b]);
    advance(48);

    visuals.dispose();

    expect(overlay()).toBeNull();
    expect(a.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
    expect(listening()).toBe(0);
    expect(clock.pending()).toBe(0);
  });
});

describe('where no animation frames run (a window that is not painted)', () => {
  beforeEach(() => {
    clock.uninstall();
    vi.useFakeTimers();
    window.requestAnimationFrame = (() => 1) as typeof window.requestAnimationFrame; // frames are accepted and never run
    window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
  });

  it('cancel still ends: the clones go and the originals come back', () => {
    const a = item('a', A);
    visuals.start(makeSession(a).session).cancel();
    expect(a).toHaveAttribute(DRAG_SOURCE_ATTRIBUTE, 'true');

    vi.advanceTimersByTime(DRAG_VISUAL_POLICY.returnMs + DRAG_VISUAL_POLICY.safetyMs + 10);

    expect(overlay()).toBeNull();
    expect(a.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
  });

  it('commit still ends', () => {
    const a = item('a', A);
    visuals.start(makeSession(a).session).commit();

    vi.advanceTimersByTime(DRAG_VISUAL_POLICY.safetyMs + 10);

    expect(overlay()).toBeNull();
    expect(a.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
  });
});

describe('reduced motion', () => {
  beforeEach(() => {
    restoreMotion();
    restoreMotion = stubReducedMotion(true);
  });

  it('keeps every original visible, puts the ghost on the cursor, draws no convergence, and ends at once', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    const { session } = makeSession(a, { x: 700, y: 500 });
    const handle = visuals.start(session, [b]);

    expect(clones()).toHaveLength(1); // only the ghost
    expect(a.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false); // several items: the originals stay visible
    expect(b.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
    expect(centreOf(clones()[0]!)).toEqual({ x: 700, y: 500 }); // on the cursor at once
    expect(document.querySelector('.drag-ghost-count')?.textContent).toBe('2');

    handle.cancel();
    expect(overlay()).toBeNull();
    expect(a.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
    expect(b.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
  });
});
