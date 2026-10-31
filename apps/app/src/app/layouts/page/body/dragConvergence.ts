/**
 * The picture of "these items are being dragged together": while a multi-item drag from a Collection View is on,
 * the checked items other than the one pressed converge on the DRAG GHOST — wherever the cursor is — and fade out,
 * as if folded into it. If the drag is cancelled each flies back to the place it came from, starting from wherever it
 * has got to; if it drops, they are left to the collection's own update.
 *
 * The destination is the ghost, not the card that was pressed: it is the pointer's live position (the drag
 * session's own, so no layout is read while the pointer moves) plus the ghost's offset from the pointer, measured
 * once when the drag starts. Each item's position is `from + progress × (destination − from)`, so a destination that
 * moves mid-flight is followed rather than chased from a stale coordinate.
 *
 * It is layout-agnostic: it styles the ACTUAL rendered element of each item (a card, a list row, a table row —
 * whatever carries the item's drag attributes) with a temporary `transform` and `opacity`, from its own bounds,
 * measured once up front. Nothing about the layout is touched, nothing is cloned, an item that is not mounted is
 * simply skipped, and the inline styles each element had are put back when it is done — whichever way it ends.
 */

/** How long one item's flight takes, out or back. */
export const CONVERGENCE_DURATION_MS = 220;
/** The start of each next item's flight is this much later than the one before it… */
export const CONVERGENCE_STAGGER_MS = 16;
/** …for at most this many items, so a large selection still settles quickly. */
export const CONVERGENCE_MAX_STAGGERED = 8;
/** Where in its flight an item starts to fade (it is gone when it arrives). */
const FADE_STARTS_AT = 0.55;

/** What the convergence follows: the drag session's live pointer. */
export interface ConvergenceFollow {
  readonly pointer: { readonly x: number; readonly y: number };
  subscribe(listener: () => void): () => void;
}

export interface Convergence {
  /** The drop succeeded: leave the items to the collection's own update (their styles are cleared once it has rendered). */
  commit(): void;
  /** The drag was cancelled or its drop refused: each item flies back to where it was, from where it is now. */
  revert(): void;
  /** Drop everything now, without animating (a new drag, or the page going away). */
  dispose(): void;
}

const NOOP: Convergence = { commit: () => undefined, revert: () => undefined, dispose: () => undefined };

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const centre = (rect: DOMRect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
/** Smooth acceleration and deceleration, no overshoot. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const opacityAt = (progress: number) => (progress <= FADE_STARTS_AT ? 1 : 1 - (progress - FADE_STARTS_AT) / (1 - FADE_STARTS_AT));

/** After the next render has had its chance to move or remove the items. */
function afterNextRender(run: () => void): void {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(run));
  } else {
    setTimeout(run, 32);
  }
}

interface Flyer {
  readonly element: HTMLElement;
  /** Where the item's centre was before anything moved. */
  readonly from: { readonly x: number; readonly y: number };
  readonly delay: number;
  /** What the element's own inline style held, put back at the end. */
  readonly savedTransform: string;
  readonly savedOpacity: string;
  /** What is applied now: how far it is from where it started, and how opaque. */
  x: number;
  y: number;
  opacity: number;
}

export function startConvergence(others: readonly HTMLElement[], follow: ConvergenceFollow, ghost?: Element | null): Convergence {
  const mounted = others.filter((element) => element.isConnected);

  if (mounted.length === 0) {
    return NOOP;
  }

  const reduced = prefersReducedMotion();

  // All the reads, once, before anything is written.
  const origins = mounted.map((element) => centre(element.getBoundingClientRect()));
  const ghostRect = ghost?.getBoundingClientRect();
  // The ghost is not necessarily centred on the pointer: its offset from it is taken as it is.
  const offset =
    ghostRect && ghostRect.width > 0 && ghostRect.height > 0
      ? { x: centre(ghostRect).x - follow.pointer.x, y: centre(ghostRect).y - follow.pointer.y }
      : { x: 0, y: 0 };

  const flyers: Flyer[] = mounted.map((element, index) => ({
    element,
    from: origins[index]!,
    delay: reduced ? 0 : Math.min(index, CONVERGENCE_MAX_STAGGERED) * CONVERGENCE_STAGGER_MS,
    savedTransform: element.style.transform,
    savedOpacity: element.style.opacity,
    x: 0,
    y: 0,
    opacity: 1,
  }));

  const apply = (flyer: Flyer) => {
    flyer.element.style.transform = flyer.x === 0 && flyer.y === 0 ? flyer.savedTransform : `translate(${flyer.x}px, ${flyer.y}px)`;
    flyer.element.style.opacity = String(flyer.opacity);
  };

  let mode: 'following' | 'returning' | 'holding' | 'done' = 'following';
  let frameId: number | null = null;
  let unsubscribe: (() => void) | null = null;
  let startedAt: number | null = null;
  let returnStartedAt: number | null = null;
  let returnFrom: { x: number; y: number; opacity: number }[] = [];

  const schedule = () => {
    if (frameId === null && mode !== 'done' && mode !== 'holding') {
      frameId = requestAnimationFrame(frame);
    }
  };

  function frame(now: number) {
    frameId = null;

    if (mode === 'following') {
      startedAt ??= now;
      const elapsed = now - startedAt;
      const target = { x: follow.pointer.x + offset.x, y: follow.pointer.y + offset.y };
      let settled = true;

      for (const flyer of flyers) {
        const progress = ease(clamp01((elapsed - flyer.delay) / CONVERGENCE_DURATION_MS));
        settled &&= elapsed - flyer.delay >= CONVERGENCE_DURATION_MS;
        // Reduced motion: the fade only, nothing travels.
        flyer.x = reduced ? 0 : (target.x - flyer.from.x) * progress;
        flyer.y = reduced ? 0 : (target.y - flyer.from.y) * progress;
        flyer.opacity = opacityAt(progress);
        apply(flyer);
      }

      // Arrived items keep following the pointer, but only when it moves (the subscription schedules that frame):
      // no frame runs for a still pointer.
      if (!settled) {
        schedule();
      }
      return;
    }

    if (mode === 'returning') {
      returnStartedAt ??= now;
      const progress = ease(clamp01((now - returnStartedAt) / CONVERGENCE_DURATION_MS));

      flyers.forEach((flyer, index) => {
        const start = returnFrom[index]!;
        flyer.x = start.x * (1 - progress);
        flyer.y = start.y * (1 - progress);
        flyer.opacity = start.opacity + (1 - start.opacity) * progress;
        apply(flyer);
      });

      if (progress >= 1) {
        finish();
      } else {
        schedule();
      }
    }
  }

  // The pointer moved: the next frame re-aims every item at the ghost's new position.
  unsubscribe = follow.subscribe(schedule);
  schedule();

  function stopFollowing() {
    unsubscribe?.();
    unsubscribe = null;
  }

  function finish() {
    if (mode === 'done') {
      return;
    }
    mode = 'done';
    stopFollowing();
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    // Back to exactly what each element had: nothing is left on it.
    for (const flyer of flyers) {
      flyer.element.style.transform = flyer.savedTransform;
      flyer.element.style.opacity = flyer.savedOpacity;
    }
  }

  return {
    commit() {
      if (mode !== 'following') {
        return;
      }
      // The items stay where they are, no longer following, until the collection has rendered its update.
      mode = 'holding';
      stopFollowing();
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      afterNextRender(finish);
    },

    revert() {
      if (mode !== 'following') {
        return;
      }
      // Each item returns from where it is NOW (what was last drawn), to its own original place.
      returnFrom = flyers.map((flyer) => ({ x: flyer.x, y: flyer.y, opacity: flyer.opacity }));
      mode = 'returning';
      stopFollowing();
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      schedule();
    },

    dispose: finish,
  };
}
