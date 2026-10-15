// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_SCROLL_EDGE_ZONE_PX,
  AUTO_SCROLL_MAX_SPEED,
  autoScrollSpeed,
  createDragAutoScroller,
  findScrollContainer,
} from './dragAutoScroll';

const RECT = { top: 100, bottom: 500, left: 0, right: 260 };

describe('autoScrollSpeed', () => {
  it('is zero in the middle of the container and outside the edge zones', () => {
    expect(autoScrollSpeed({ x: 100, y: 300 }, RECT)).toBe(0);
    expect(autoScrollSpeed({ x: 100, y: 100 + AUTO_SCROLL_EDGE_ZONE_PX }, RECT)).toBe(0);
    expect(autoScrollSpeed({ x: 100, y: 500 - AUTO_SCROLL_EDGE_ZONE_PX }, RECT)).toBe(0);
  });

  it('scrolls up near the top edge and down near the bottom edge', () => {
    expect(autoScrollSpeed({ x: 100, y: 110 }, RECT)).toBeLessThan(0);
    expect(autoScrollSpeed({ x: 100, y: 490 }, RECT)).toBeGreaterThan(0);
  });

  it('speeds up the closer the pointer is to the edge, up to a maximum that holds beyond it', () => {
    const at = (y: number) => autoScrollSpeed({ x: 100, y }, RECT);
    expect(at(490)).toBeGreaterThan(at(470));
    expect(at(470)).toBeGreaterThan(at(450));
    expect(at(500)).toBe(AUTO_SCROLL_MAX_SPEED);
    expect(at(900)).toBe(AUTO_SCROLL_MAX_SPEED);
    expect(autoScrollSpeed({ x: 100, y: -300 }, RECT)).toBe(-AUTO_SCROLL_MAX_SPEED);
  });

  it('never scrolls for a pointer that has left the container sideways', () => {
    expect(autoScrollSpeed({ x: -5, y: 495 }, RECT)).toBe(0);
    expect(autoScrollSpeed({ x: 400, y: 105 }, RECT)).toBe(0);
  });

  it('shrinks the zone for a short container so the two zones never overlap', () => {
    const short = { top: 0, bottom: 80, left: 0, right: 260 };
    expect(autoScrollSpeed({ x: 100, y: 40 }, short)).toBe(0);
  });
});

describe('findScrollContainer', () => {
  it('finds the nearest vertically scrolling ancestor, not the outermost element', () => {
    const outer = document.createElement('div');
    outer.style.overflowY = 'hidden';
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    const wrapper = document.createElement('div');
    const row = document.createElement('div');
    outer.append(scroller);
    scroller.append(wrapper);
    wrapper.append(row);

    expect(findScrollContainer(row)).toBe(scroller);
  });

  it('is null when nothing scrolls', () => {
    const row = document.createElement('div');
    document.body.append(row);
    expect(findScrollContainer(row)).toBeNull();
    row.remove();
  });
});

describe('createDragAutoScroller', () => {
  let container: HTMLElement;
  let scrollTop = 0;
  let maxScroll = 400;

  beforeEach(() => {
    vi.useFakeTimers();
    scrollTop = 0;
    maxScroll = 400;
    container = document.createElement('div');
    Object.defineProperty(container, 'scrollTop', {
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.min(maxScroll, Math.max(0, value));
      },
    });
    container.getBoundingClientRect = () => ({ ...RECT, x: 0, y: RECT.top, width: 260, height: 400, toJSON: () => ({}) });
  });
  afterEach(() => vi.useRealTimers());

  const frames = (n: number) => vi.advanceTimersByTime(n * 17);

  it('scrolls down every frame while the pointer rests in the bottom zone, reporting each move', () => {
    const onScrolled = vi.fn();
    const scroller = createDragAutoScroller(container, () => ({ x: 100, y: 495 }), onScrolled);
    scroller.poke();
    frames(5);

    expect(scrollTop).toBeGreaterThan(0);
    expect(onScrolled.mock.calls.length).toBeGreaterThanOrEqual(4);
    scroller.stop();
  });

  it('scrolls the area under the pointer when several are offered — not the one the drag began in', () => {
    const makeArea = (left: number, width: number) => {
      const area = document.createElement('div');
      let top = 0;
      Object.defineProperty(area, 'scrollTop', { get: () => top, set: (v: number) => (top = Math.min(400, Math.max(0, v))) });
      area.getBoundingClientRect = () => ({ ...RECT, left, right: left + width, x: left, y: RECT.top, width, height: 400, toJSON: () => ({}) });
      return area;
    };
    const page = makeArea(300, 500);
    const sidebar = makeArea(0, 260);
    const scroller = createDragAutoScroller([page, sidebar], () => ({ x: 100, y: 495 }), vi.fn());
    scroller.poke();
    frames(5);
    expect(sidebar.scrollTop).toBeGreaterThan(0);
    expect(page.scrollTop).toBe(0);
    scroller.stop();

    // …and the page, when the pointer is over the page.
    const overPage = createDragAutoScroller([page, sidebar], () => ({ x: 500, y: 105 }), vi.fn());
    page.scrollTop = 200;
    overPage.poke();
    frames(5);
    expect(page.scrollTop).toBeLessThan(200);
    expect(sidebar.scrollTop).toBeGreaterThan(0);
    overPage.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('scrolls up from the top zone', () => {
    scrollTop = 300;
    const scroller = createDragAutoScroller(container, () => ({ x: 100, y: 105 }), vi.fn());
    scroller.poke();
    frames(5);
    expect(scrollTop).toBeLessThan(300);
    scroller.stop();
  });

  it('does not start outside the zones, and leaves no frame pending', () => {
    const scroller = createDragAutoScroller(container, () => ({ x: 100, y: 300 }), vi.fn());
    scroller.poke();
    expect(vi.getTimerCount()).toBe(0);
    frames(5);
    expect(scrollTop).toBe(0);
  });

  it('stops by itself at the scroll limit, and again at the top limit', () => {
    maxScroll = 30;
    const scroller = createDragAutoScroller(container, () => ({ x: 100, y: 499 }), vi.fn());
    scroller.poke();
    frames(20);
    expect(scrollTop).toBe(30);
    expect(vi.getTimerCount()).toBe(0); // no loop left running

    let y = 101;
    const up = createDragAutoScroller(container, () => ({ x: 100, y }), vi.fn());
    up.poke();
    frames(40);
    expect(scrollTop).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    y = 300;
  });

  it('stops by itself when the pointer leaves the zone, and a poke restarts it', () => {
    let y = 495;
    const scroller = createDragAutoScroller(container, () => ({ x: 100, y }), vi.fn());
    scroller.poke();
    frames(3);
    const reached = scrollTop;

    y = 300;
    frames(3);
    expect(scrollTop).toBe(reached);
    expect(vi.getTimerCount()).toBe(0);

    y = 495;
    scroller.poke();
    frames(3);
    expect(scrollTop).toBeGreaterThan(reached);
    scroller.stop();
  });

  it('runs one loop even when onScrolled pokes it again', () => {
    let scroller: ReturnType<typeof createDragAutoScroller>;
    scroller = createDragAutoScroller(container, () => ({ x: 100, y: 495 }), () => scroller.poke());
    scroller.poke();
    frames(4);
    expect(vi.getTimerCount()).toBe(1);

    scroller.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stop() cancels the pending frame', () => {
    const scroller = createDragAutoScroller(container, () => ({ x: 100, y: 495 }), vi.fn());
    scroller.poke();
    expect(vi.getTimerCount()).toBe(1);
    scroller.stop();
    expect(vi.getTimerCount()).toBe(0);
    frames(5);
    expect(scrollTop).toBe(0);
  });

  it('reads the container\'s bounds every frame, so a resize during the drag is honoured', () => {
    let rect = { ...RECT };
    container.getBoundingClientRect = () => ({ ...rect, x: 0, y: rect.top, width: 260, height: rect.bottom - rect.top, toJSON: () => ({}) });
    const scroller = createDragAutoScroller(container, () => ({ x: 100, y: 495 }), vi.fn());
    scroller.poke();
    frames(2);
    const before = scrollTop;

    rect = { ...RECT, bottom: 900 }; // the sidebar got taller: 495 is no longer near its bottom
    frames(5);
    expect(scrollTop).toBe(before);
    scroller.stop();
  });
});
