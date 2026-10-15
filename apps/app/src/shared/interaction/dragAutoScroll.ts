/**
 * Edge auto-scrolling for a drag: while the pointer rests near the top or bottom of a scrollable area,
 * the area scrolls toward it, faster the closer the pointer is to (or beyond) the edge.
 *
 * Presentation mechanics only, like `usePointerDrag`: it reads the pointer, scrolls one container and
 * reports that it did. It knows nothing about what is being dragged or dropped.
 */

/** The nearest ancestor that scrolls vertically (`overflow-y: auto | scroll | overlay`), not assumed to be any particular element. */
export function findScrollContainer(from: HTMLElement): HTMLElement | null {
  for (let element = from.parentElement; element; element = element.parentElement) {
    const { overflowY } = getComputedStyle(element);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return element;
    }
  }
  return null;
}

/** How close to an edge (px, at most a quarter of the visible height) the pointer starts scrolling. */
export const AUTO_SCROLL_EDGE_ZONE_PX = 56;
/** Scroll speed at the edge, in px per 60 Hz frame. */
export const AUTO_SCROLL_MAX_SPEED = 16;

/**
 * Signed px per 60 Hz frame for a pointer at `pointer` over `rect` (the container's visible bounds): negative
 * scrolls up, positive down, 0 none. Ramps from a crawl at the zone's inner edge to the maximum at the
 * container's edge, and stays at the maximum beyond it — but only while the pointer is within the container's
 * horizontal extent, so a pointer that has left the sidebar sideways never scrolls it.
 */
export function autoScrollSpeed(
  pointer: { readonly x: number; readonly y: number },
  rect: { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number }
): number {
  if (pointer.x < rect.left || pointer.x > rect.right) {
    return 0;
  }

  const zone = Math.min(AUTO_SCROLL_EDGE_ZONE_PX, (rect.bottom - rect.top) / 4);
  const intoTop = rect.top + zone - pointer.y;
  const intoBottom = pointer.y - (rect.bottom - zone);

  if (intoTop > 0) {
    return -scaled(intoTop / zone);
  }
  if (intoBottom > 0) {
    return scaled(intoBottom / zone);
  }
  return 0;
}

const scaled = (depth: number) => Math.max(1, Math.round(AUTO_SCROLL_MAX_SPEED * Math.min(1, depth) ** 2));

export interface DragAutoScroller {
  /** Call whenever the pointer moves or the content changes: (re)starts the loop if the pointer is in an edge zone. */
  poke(): void;
  /** Cancels any pending frame. Safe to call repeatedly. */
  stop(): void;
}

/**
 * The frame loop. It only runs while it has something to do: each frame re-reads the pointer and the
 * container's bounds, scrolls, and asks for another frame only if it actually moved — so it ends by itself
 * when the pointer leaves the zone or the container reaches its limit, and `poke()` starts it again.
 * `onScrolled` is called after every frame that moved the content (the pointer may be stationary, but what
 * is under it changed).
 */
export function createDragAutoScroller(
  containers: HTMLElement | readonly HTMLElement[],
  getPointer: () => { readonly x: number; readonly y: number },
  onScrolled: () => void
): DragAutoScroller {
  let frame = 0;
  let last: number | null = null;
  const candidates = 'length' in containers ? containers : [containers];

  // The area to scroll is the one the pointer is over — not the one the drag began in, which may be a
  // different container (a Collection View drag held over the sidebar). Several areas can share the pointer's
  // column only if nested, so the element under the pointer decides; otherwise the first one the pointer is
  // inside the horizontal extent of and near the edge of.
  const pick = () => {
    const pointer = getPointer();
    const under = document.elementFromPoint?.(pointer.x, pointer.y) ?? null;
    const ordered = under ? [...candidates.filter((c) => c.contains(under)), ...candidates.filter((c) => !c.contains(under))] : candidates;
    for (const container of ordered) {
      const speed = autoScrollSpeed(pointer, container.getBoundingClientRect());
      if (speed !== 0) {
        return { container, speed };
      }
    }
    return null;
  };

  const step = (time: number) => {
    frame = 0;
    const elapsed = last === null ? 1000 / 60 : Math.min(time - last, 50);
    last = time;

    const picked = pick();
    if (!picked) {
      last = null;
      return;
    }
    const { container, speed } = picked;

    const before = container.scrollTop;
    container.scrollTop = before + speed * (elapsed / (1000 / 60));
    if (container.scrollTop === before) {
      last = null; // at the limit: nothing more to do until the pointer or content changes
      return;
    }

    onScrolled();
    // (`onScrolled` may itself `poke()` — never run two loops.)
    if (frame === 0) {
      frame = requestAnimationFrame(step);
    }
  };

  return {
    poke() {
      if (frame === 0 && pick() !== null) {
        frame = requestAnimationFrame(step);
      }
    },
    stop() {
      if (frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      last = null;
    },
  };
}
