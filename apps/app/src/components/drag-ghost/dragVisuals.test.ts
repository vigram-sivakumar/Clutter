// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
const FULL = 1500;

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

/** A clone's background fill, in percent (the custom property the stylesheet mixes into the surface colour). */
const fillOf = (element: HTMLElement) => parseFloat(element.style.getPropertyValue('--drag-ghost-fill-opacity'));
const noOpacityAnywhere = () =>
  [...document.querySelectorAll<HTMLElement>('.drag-visuals .drag-ghost, .drag-visuals .drag-ghost *')].every((el) => el.style.opacity === '');

describe('the background fill — the only thing that fades', () => {
  it('eases from 100% down to the token\'s 50% while the clone travels to the cursor, and stays there', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    visuals.start(makeSession(a, { x: 700, y: 500 }).session, [b]);
    const [lead, other] = clones() as [HTMLElement, HTMLElement];

    expect(fillOf(lead)).toBe(100);
    expect(fillOf(other)).toBe(100);

    advance(160);
    for (const clone of [lead, other]) {
      expect(fillOf(clone)).toBeLessThan(100);
      expect(fillOf(clone)).toBeGreaterThan(50);
    }
    expect(Math.hypot(centreOf(other).x - 250, centreOf(other).y - 220)).toBeGreaterThan(1); // moving at the same time

    advance(FULL);
    expect(fillOf(lead)).toBe(50);
    expect(fillOf(other)).toBe(50);
  });

  it('takes its target from the `--drag-ghost-background-opacity` token', () => {
    document.documentElement.style.setProperty('--drag-ghost-background-opacity', '30%');
    try {
      const a = item('a', A);
      visuals.start(makeSession(a, { x: 700, y: 500 }).session);
      advance(FULL);

      expect(fillOf(clones()[0]!)).toBe(30);
    } finally {
      document.documentElement.style.removeProperty('--drag-ghost-background-opacity');
    }
  });

  it('never fades the ghost or its contents: no opacity is set on a clone or anything inside it, in any phase', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    const handle = visuals.start(makeSession(a, { x: 700, y: 500 }).session, [b]);
    expect(noOpacityAnywhere()).toBe(true); // born opaque
    advance(70);
    expect(noOpacityAnywhere()).toBe(true); // travelling
    advance(FULL);
    handle.cancel();
    advance(DRAG_VISUAL_POLICY.returnMs / 2);
    expect(noOpacityAnywhere()).toBe(true); // returning
    advance(FULL);
    expect(overlay()).toBeNull();
  });

  it('the stylesheet mixes the fill into the theme\'s own surface colour — no separate light and dark colours', () => {
    const css = readFileSync(join(__dirname, 'DragGhost.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = css.match(/\.drag-ghost \{([^}]*)\}/)![1]!;

    expect(rule).toMatch(/color-mix\(\s*in srgb,\s*var\(--surface-tertiary\) var\(--drag-ghost-fill-opacity, var\(--drag-ghost-background-opacity\)\),\s*transparent\s*\)/);
    expect(css).not.toMatch(/drag-ghost[^{]*\{[^}]*\bopacity:/); // the ghost itself is never made translucent
    expect(css).not.toMatch(/@keyframes drag-ghost-(lift|land)/); // and nothing fades it in or out
  });

  it('cancel: the fill and the position return together, from where they are now — never reset first — and the clone stays until it has arrived', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    const handle = visuals.start(makeSession(a, { x: 700, y: 500 }).session, [b]);
    advance(70); // mid-flight: part-way in both
    const [lead, other] = clones() as [HTMLElement, HTMLElement];
    const before = { fill: fillOf(other), x: centreOf(other).x, y: centreOf(other).y };
    expect(before.fill).toBeLessThan(100);

    handle.cancel();
    advance(16);
    expect(Math.abs(fillOf(other) - before.fill)).toBeLessThan(15); // continues from the current fill…
    expect(Math.abs(centreOf(other).x - before.x)).toBeLessThan(40); // …and the current place
    expect(Math.abs(centreOf(other).y - before.y)).toBeLessThan(40);

    advance(DRAG_VISUAL_POLICY.returnMs / 2);
    expect(fillOf(other)).toBeGreaterThan(before.fill); // rising back towards 100% as it travels back
    expect(overlay()).not.toBeNull(); // nothing is removed early
    advance(DRAG_VISUAL_POLICY.returnMs / 2 + 40);
    expect(overlay()).toBeNull();
    expect(lead.isConnected).toBe(false);
  });

  it('a fully settled ghost returns from 50% back up to 100%, and is removed only on arrival', () => {
    const a = item('a', A);
    const handle = visuals.start(makeSession(a, { x: 700, y: 500 }).session);
    advance(FULL);
    expect(fillOf(clones()[0]!)).toBe(50);

    handle.cancel();
    advance(DRAG_VISUAL_POLICY.returnMs * 0.5);
    const mid = fillOf(clones()[0]!);
    expect(mid).toBeGreaterThan(50);
    expect(mid).toBeLessThan(100);
    expect(a).toHaveAttribute(DRAG_SOURCE_ATTRIBUTE, 'true'); // the original is shown only when the clone is gone

    advance(DRAG_VISUAL_POLICY.returnMs);
    expect(overlay()).toBeNull();
    expect(a.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
  });

  it('cancelling an animation already in progress, then another drag at once, leaves no stale fill or clone', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    const first = visuals.start(makeSession(a, { x: 700, y: 500 }).session, [b]);
    advance(40);
    first.cancel();
    advance(40);

    const second = visuals.start(makeSession(b).session, [a]);
    expect(document.querySelectorAll('.drag-visuals')).toHaveLength(1);
    expect(clones().every((clone) => fillOf(clone) === 100)).toBe(true); // a fresh start, from nothing

    second.dispose();
    advance(FULL);
    expect(overlay()).toBeNull();
    expect(clock.pending()).toBe(0);
  });

  it('with reduced motion the fill is at its final value at once, and a cancel ends at once', () => {
    restoreMotion();
    restoreMotion = stubReducedMotion(true);
    const [a, b] = [item('a', A), item('b', B)] as const;
    const handle = visuals.start(makeSession(a, { x: 700, y: 500 }).session, [b]);

    expect(fillOf(clones()[0]!)).toBe(50);
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

  it('commit: nothing flies back, fades or changes — the clones stay where the cursor left them until the collection has updated, then go with the hiding', () => {
    const a = item('a', A);
    const { session } = makeSession(a, { x: 700, y: 500 });
    const handle = visuals.start(session);
    advance(FULL);
    handle.release();
    const where = centreOf(clones()[0]!);
    const fillBefore = fillOf(clones()[0]!);

    handle.commit();
    advance(16);
    expect(overlay()).not.toBeNull(); // not before the render: neither a duplicate nor a gap
    expect(a).toHaveAttribute(DRAG_SOURCE_ATTRIBUTE, 'true');
    expect(centreOf(clones()[0]!)).toEqual(where); // in place — no flight back
    expect(fillOf(clones()[0]!)).toBe(fillBefore); // no animation of any kind
    expect(clones()[0]!.style.opacity).toBe('');

    advance(FULL);
    expect(overlay()).toBeNull();
    expect(a.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
    expect(clock.pending()).toBe(0);
  });

  it('commit of several items: the originals stay as they were, only the clones go', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    const before = [a, b].map((el) => el.outerHTML);
    const handle = visuals.start(makeSession(a, { x: 700, y: 500 }).session, [b]);
    advance(FULL);

    handle.commit();
    advance(16);
    expect([a, b].map((el) => el.outerHTML)).toEqual(before);
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
