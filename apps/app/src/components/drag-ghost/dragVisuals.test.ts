// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PointerDragSession } from '@shared/interaction';

import { DRAG_SOURCE_ATTRIBUTE, SNAPSHOT, createDragVisuals, type DragVisuals } from './dragVisuals';

let visuals: DragVisuals;
beforeEach(() => {
  visuals = createDragVisuals();
});
afterEach(() => {
  visuals.dispose();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A rendered item: a bordered, rounded "card" with an id, a role, a focusable button and drag markers inside. */
function item(name: string, rect: Rect): HTMLElement {
  const element = document.createElement('div');
  element.id = `item-${name}`;
  element.setAttribute('role', 'button');
  element.setAttribute('tabindex', '0');
  element.dataset.dragId = name;
  element.dataset.dragKind = 'note';
  element.dataset.dragInsideOnly = 'true';
  element.style.border = '1px solid red';
  element.innerHTML = `<button id="inner-${name}">Open ${name}</button><span>${name}</span>`;
  element.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) }) as DOMRect;
  document.body.append(element);
  return element;
}

function makeSession(source: HTMLElement, pointer = { x: 500, y: 400 }, extra: Partial<PointerDragSession> = {}) {
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
    ...extra,
  } as PointerDragSession;
  const move = (x: number, y: number) => {
    (session.pointer as { x: number; y: number }).x = x;
    (session.pointer as { x: number; y: number }).y = y;
    listeners.forEach((listener) => listener());
  };
  return { session, move, listening: () => listeners.size };
}

const overlay = () => document.querySelector<HTMLElement>('.drag-visuals');
const ghosts = () => [...document.querySelectorAll<HTMLElement>('.drag-visuals .drag-ghost:not(.drag-ghost--piece)')];
const pieces = () => [...document.querySelectorAll<HTMLElement>('.drag-snapshot .drag-ghost--piece')];
const snapshot = () => document.querySelector<HTMLElement>('.drag-snapshot');
const boxOf = (element: HTMLElement) => {
  const m = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(element.style.transform)!;
  return { x: Number(m[1]), y: Number(m[2]), width: parseFloat(element.style.width), height: parseFloat(element.style.height) };
};

const A = { left: 100, top: 100, width: 300, height: 40 };
const B = { left: 100, top: 200, width: 300, height: 40 };
const C = { left: 100, top: 300, width: 300, height: 40 };

describe('a single item', () => {
  it('draws one ghost — a harmless clone — and hides the original, which stays in the DOM and keeps its inline style', () => {
    const a = item('a', A);
    const before = a.getAttribute('style');

    visuals.start(makeSession(a).session);

    expect(ghosts()).toHaveLength(1);
    expect(document.querySelectorAll('.drag-visuals')).toHaveLength(1);
    expect(a).toHaveAttribute(DRAG_SOURCE_ATTRIBUTE, 'true');
    expect(a.isConnected).toBe(true);
    expect(a.getAttribute('style')).toBe(before);
  });

  it('the ghost is inert and hidden from assistive tech, with no ids, nothing focusable and no drag markers', () => {
    const a = item('a', A);
    visuals.start(makeSession(a).session);

    expect(overlay()).toHaveAttribute('inert');
    expect(overlay()).toHaveAttribute('aria-hidden', 'true');
    const ghost = ghosts()[0]!;
    expect(ghost).toHaveAttribute('inert');
    expect(ghost.querySelectorAll('[id], [tabindex], [role]')).toHaveLength(0);
    expect([...ghost.querySelectorAll('*')].some((el) => [...el.attributes].some((attr) => attr.name.startsWith('data-drag')))).toBe(false);
    expect(document.querySelectorAll('[id="item-a"]')).toHaveLength(1);
  });

  it('follows the pointer directly: centred on it at once, and exactly on every move', () => {
    const a = item('a', A);
    const { session, move } = makeSession(a, { x: 700, y: 500 });
    visuals.start(session);

    expect(boxOf(ghosts()[0]!)).toEqual({ x: 700 - 150, y: 500 - 20, width: 300, height: 40 });
    move(40, 60);
    expect(boxOf(ghosts()[0]!)).toEqual({ x: 40 - 150, y: 60 - 20, width: 300, height: 40 });
  });

  it('has no animation of any kind: no frame, no timer, no opacity, no transition', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const timers = vi.spyOn(window, 'setTimeout');
    const a = item('a', A);
    const { session, move } = makeSession(a);

    visuals.start(session);
    move(10, 10);
    visuals.dispose();

    expect(raf).not.toHaveBeenCalled();
    expect(timers).not.toHaveBeenCalled();
  });

  it('restores exactly what the original held, and the ghost is gone at once', () => {
    const a = item('a', A);
    a.setAttribute(DRAG_SOURCE_ATTRIBUTE, 'previous');
    visuals.start(makeSession(a).session);

    visuals.dispose();

    expect(overlay()).toBeNull();
    expect(a.getAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe('previous');
  });

  it('a column-pinned row (the sidebar) keeps its own column while the pointer is over its container', () => {
    const a = item('a', { left: 12, top: 100, width: 236, height: 28 });
    const container = document.createElement('div');
    container.style.overflowY = 'auto';
    container.getBoundingClientRect = () => ({ left: 0, right: 260, top: 0, bottom: 800, width: 260, height: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    container.append(a);
    document.body.append(container);
    a.setAttribute('data-drag-ghost-follow', 'outside-container');
    const { session, move } = makeSession(a, { x: 100, y: 300 });
    visuals.start(session);

    expect(ghosts()[0]!.style.left).toBe('12px');
    move(400, 300); // out over the page: centred on the cursor
    expect(ghosts()[0]!.style.left).toBe('0px');
  });
});

describe('several items — a snapshot of the collection as it is', () => {
  const at = (el: HTMLElement) => ({ left: parseFloat(el.style.left), top: parseFloat(el.style.top), width: parseFloat(el.style.width), height: parseFloat(el.style.height) });

  it('draws ONE layer holding a clone of each selected item — at its own measured place and size — and leaves EVERY original untouched', () => {
    const [a, b, c] = [item('a', A), item('b', B), item('c', C)] as const;
    const before = [a, b, c].map((el) => el.outerHTML);

    visuals.start(makeSession(a, { x: 700, y: 500 }).session, [b, c]);

    expect(snapshot()).not.toBeNull();
    expect(ghosts()).toHaveLength(0); // no single-item ghost, no separate grid
    expect(pieces()).toHaveLength(3);
    expect(pieces().map((p) => at(p))).toEqual([
      { left: 0, top: 0, width: 300, height: 40 },
      { left: 0, top: 100, width: 300, height: 40 },
      { left: 0, top: 200, width: 300, height: 40 },
    ]); // exactly the originals' own sizes and distances from one another
    expect([a, b, c].map((el) => el.outerHTML)).toEqual(before); // visible, unmarked, unstyled — throughout
    visuals.dispose();
    expect([a, b, c].map((el) => el.outerHTML)).toEqual(before);
  });

  it('keeps the relative positions of a card grid — columns, gaps and rows — without computing any layout', () => {
    // Four "cards" in a 2-column grid: 220 × 300 with a 16px gap, starting at (400, 120).
    const cards = [
      item('c0', { left: 400, top: 120, width: 220, height: 300 }),
      item('c1', { left: 636, top: 120, width: 220, height: 300 }),
      item('c2', { left: 400, top: 436, width: 220, height: 300 }),
      item('c3', { left: 636, top: 436, width: 220, height: 300 }),
    ];

    visuals.start(makeSession(cards[1]!, { x: 700, y: 200 }).session, [cards[0]!, cards[2]!, cards[3]!]);

    const byName = new Map(pieces().map((piece, index) => [index, at(piece)]));
    const rects = [...byName.values()];
    expect(rects).toEqual(
      expect.arrayContaining([
        { left: 0, top: 0, width: 220, height: 300 },
        { left: 236, top: 0, width: 220, height: 300 },
        { left: 0, top: 316, width: 220, height: 300 },
        { left: 236, top: 316, width: 220, height: 300 },
      ])
    );
    expect(parseFloat(snapshot()!.style.width)).toBe(456);
    expect(parseFloat(snapshot()!.style.height)).toBe(616);
  });

  it('unselected neighbours are simply absent (lifted out), so a non-contiguous selection keeps its gaps', () => {
    const [a, c] = [item('a', A), item('c', C)] as const; // b, between them, is not selected

    visuals.start(makeSession(a).session, [c]);

    expect(pieces().map((p) => at(p).top)).toEqual([0, 200]);
    expect(parseFloat(snapshot()!.style.height)).toBe(240);
  });

  it('mirrors a list or table row: its own full width and height, and a grid row\'s columns as the page resolved them', () => {
    const rowA = item('ra', { left: 0, top: 100, width: 1400, height: 36 });
    const rowB = item('rb', { left: 0, top: 136, width: 1400, height: 36 });
    const real = window.getComputedStyle;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element, pseudo?: string | null) => {
      const style = real(element, pseudo);
      if (element === rowA || element === rowB) {
        return { ...style, display: 'grid', gridTemplateColumns: '420px 300px 200px 480px' } as unknown as CSSStyleDeclaration;
      }
      return style;
    });

    visuals.start(makeSession(rowA).session, [rowB]);

    expect(pieces().map((p) => at(p))).toEqual([
      { left: 0, top: 0, width: 1400, height: 36 },
      { left: 0, top: 36, width: 1400, height: 36 },
    ]);
    for (const piece of pieces()) {
      const clone = piece.firstElementChild as HTMLElement;
      expect(clone.style.display).toBe('grid');
      expect(clone.style.gridTemplateColumns).toBe('420px 300px 200px 480px');
    }
  });

  it('draws only the first few rows — the rows ending at the lead\'s own when it is further down', () => {
    const rows = Array.from({ length: 6 }, (_, i) => item(`r${i}`, { left: 0, top: i * 60, width: 300, height: 40 }));

    visuals.start(makeSession(rows[0]!).session, rows.slice(1));
    expect(pieces()).toHaveLength(SNAPSHOT.maxRows);
    visuals.dispose();

    visuals.start(makeSession(rows[5]!).session, rows.slice(0, 5));
    expect(pieces()).toHaveLength(SNAPSHOT.maxRows);
    expect(pieces().some((p) => p.textContent === 'Open r5r5')).toBe(true);
  });

  it('is lifted out in place: it starts exactly over the originals and then moves with the pointer as one unit', () => {
    const [a, b] = [item('a', { left: 400, top: 120, width: 220, height: 300 }), item('b', { left: 636, top: 120, width: 220, height: 300 })] as const;
    const { session, move } = makeSession(a, { x: 450, y: 200 }); // grabbed 50, 80 into the first card
    visuals.start(session, [b]);
    const ghost = snapshot()!;

    expect(boxOf(ghost)).toEqual({ x: 400, y: 120, width: 456, height: 300 }); // over the originals: no jump

    move(750, 260);
    expect(boxOf(ghost)).toEqual({ x: 700, y: 180, width: 456, height: 300 }); // the same grip, wherever the pointer goes
    move(0, 0);
    expect(boxOf(ghost)).toMatchObject({ x: -50, y: -80 });
  });

  it('is not clipped by the source container: it lives in the body-level overlay', () => {
    const container = document.createElement('div');
    container.style.overflow = 'hidden';
    document.body.append(container);
    const [a, b] = [item('a', A), item('b', B)] as const;
    container.append(a, b);

    visuals.start(makeSession(a).session, [b]);

    expect(snapshot()!.closest('.drag-visuals')!.parentElement).toBe(document.body);
    expect(container.contains(snapshot())).toBe(false);
  });

  it('the pieces are harmless pictures: inert, no ids, nothing focusable, no drag markers', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    visuals.start(makeSession(a).session, [b]);

    for (const piece of pieces()) {
      expect(piece).toHaveAttribute('inert');
      expect(piece.querySelectorAll('[id], [tabindex], [role]')).toHaveLength(0);
      expect([...piece.querySelectorAll('*')].some((el) => [...el.attributes].some((attr) => attr.name.startsWith('data-drag')))).toBe(false);
    }
    expect(document.querySelectorAll('[id="item-a"]')).toHaveLength(1);
  });

  it('an item that is not mounted (virtualised, or gone) is simply not drawn — and one left alone is a single-item drag', () => {
    const [a, b, c] = [item('a', A), item('b', B), item('c', C)] as const;
    b.remove();
    visuals.start(makeSession(a).session, [b, c]);
    expect(pieces()).toHaveLength(2);
    visuals.dispose();

    c.remove();
    visuals.start(makeSession(a).session, [b, c]);
    expect(snapshot()).toBeNull();
    expect(ghosts()).toHaveLength(1);
    expect(a).toHaveAttribute(DRAG_SOURCE_ATTRIBUTE, 'true');
  });
});

describe('ending a drag', () => {
  it('the ghost is gone at once and nothing is left: no overlay, no pointer subscription, no hiding', () => {
    const a = item('a', A);
    const { session, listening } = makeSession(a);
    visuals.start(session);
    expect(listening()).toBe(1);

    visuals.dispose();

    expect(overlay()).toBeNull();
    expect(listening()).toBe(0);
    expect(a.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
  });

  it('is idempotent', () => {
    const a = item('a', A);
    visuals.start(makeSession(a).session);

    visuals.dispose();
    visuals.dispose();
    visuals.dispose();

    expect(overlay()).toBeNull();
    expect(a.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
  });

  it('a new drag ends the last one first: there is only ever one overlay, and the old original is back', () => {
    const [a, b] = [item('a', A), item('b', B)] as const;
    visuals.start(makeSession(a).session);

    visuals.start(makeSession(b).session);

    expect(document.querySelectorAll('.drag-visuals')).toHaveLength(1);
    expect(a.hasAttribute(DRAG_SOURCE_ATTRIBUTE)).toBe(false);
    expect(b).toHaveAttribute(DRAG_SOURCE_ATTRIBUTE, 'true');
  });
});

describe('the stylesheet', () => {
  const css = readFileSync(join(__dirname, 'DragGhost.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('animates nothing: no keyframes, no transition, no animation, no opacity on the ghost', () => {
    expect(css).not.toMatch(/@keyframes/);
    expect(css).not.toMatch(/\banimation\s*:/);
    expect(css).not.toMatch(/\btransition\s*:/);
    expect(css).not.toMatch(/(?<![-\w])opacity\s*:/);
  });

  it('keeps the theme-aware fill: the surface colour mixed with the fill token', () => {
    expect(css).toMatch(/color-mix\(\s*in srgb,\s*var\(--surface-tertiary\) var\(--drag-ghost-background-opacity\),\s*transparent\s*\)/);
  });

  it('the snapshot layer has no fill or shadow of its own — only the lifted items do', () => {
    const rule = css.match(/\.drag-snapshot \{([^}]*)\}/)![1]!;
    expect(rule).not.toMatch(/background|box-shadow/);
  });

  it('hides a dragged original with `visibility`, which takes its border, shadow and pseudo-elements with it', () => {
    expect(css).toMatch(/\[data-drag-source='true'\]\s*\{\s*visibility:\s*hidden;/);
  });
});
