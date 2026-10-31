/**
 * The picture of "these items are being dragged together": while a multi-item drag from a Collection View is on,
 * the checked items other than the one pressed fly to it and fade out, as if folded into the drag ghost; if the
 * drag is cancelled they fly back, and if it drops they are left to the collection's own update.
 *
 * It is layout-agnostic on purpose: it animates the ACTUAL rendered element of each item (a card, a list row, a
 * table row — whatever carries the item's drag attributes), from its own measured bounds to the pressed one's, with
 * a temporary `transform` and `opacity` on the Web Animations timeline. Nothing about the layout is touched, no
 * element is cloned, and an item that is not mounted is simply not animated. Cancelling an animation clears its
 * effect, so no style is ever left behind.
 *
 * Every bound is read ONCE, up front and before anything is animated — never per pointer move. The items scroll with
 * the pressed one (they share a scroll container), so the offsets taken at the start stay right however the page
 * scrolls during the drag.
 */

/** How long one item's flight takes. */
export const CONVERGENCE_DURATION_MS = 220;
/** The start of each next item's flight is this much later than the one before it… */
export const CONVERGENCE_STAGGER_MS = 16;
/** …for at most this many items, so a large selection still settles quickly. */
export const CONVERGENCE_MAX_STAGGERED = 8;
/** Smooth acceleration and deceleration, with no overshoot. */
export const CONVERGENCE_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const FADE_STARTS_AT = 0.55;

export interface Convergence {
  /** The drop succeeded: leave the items to the collection's own update (their animations end once it has rendered). */
  commit(): void;
  /** The drag was cancelled or its drop refused: fly back to where each item was, from wherever the flight has got to. */
  revert(): void;
  /** Drop everything now, without animating (a new drag, or the page going away). */
  dispose(): void;
}

const NOOP: Convergence = { commit: () => undefined, revert: () => undefined, dispose: () => undefined };

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const centre = (rect: DOMRect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

/** After the next render has had its chance to move or remove the items. */
function afterNextRender(run: () => void): void {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(run));
  } else {
    setTimeout(run, 32);
  }
}

export function startConvergence(primary: HTMLElement, others: readonly HTMLElement[]): Convergence {
  const flying = others.filter((element) => element !== primary && element.isConnected && typeof element.animate === 'function');

  if (flying.length === 0) {
    return NOOP;
  }

  const reduced = prefersReducedMotion();

  // All the reads, before any write.
  const target = centre(primary.getBoundingClientRect());
  const offsets = flying.map((element) => {
    const from = centre(element.getBoundingClientRect());
    return { dx: target.x - from.x, dy: target.y - from.y };
  });

  const animations: Animation[] = flying.map((element, index) => {
    const { dx, dy } = offsets[index]!;
    // Reduced motion: no movement at all, only the fade.
    const keyframes: Keyframe[] = reduced
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [
          { transform: 'translate(0px, 0px)', opacity: 1, offset: 0 },
          { opacity: 1, offset: FADE_STARTS_AT },
          { transform: `translate(${dx}px, ${dy}px)`, opacity: 0, offset: 1 },
        ];

    return element.animate(keyframes, {
      duration: reduced ? CONVERGENCE_DURATION_MS / 2 : CONVERGENCE_DURATION_MS,
      delay: reduced ? 0 : Math.min(index, CONVERGENCE_MAX_STAGGERED) * CONVERGENCE_STAGGER_MS,
      easing: CONVERGENCE_EASING,
      fill: 'forwards',
    });
  });

  let state: 'flying' | 'settling' | 'finished' = 'flying';
  let timers: ReturnType<typeof setTimeout>[] = [];

  const finish = () => {
    if (state === 'finished') {
      return;
    }
    state = 'finished';
    timers.forEach(clearTimeout);
    timers = [];
    // Cancelling clears each animation's effect: the item is exactly as it was, with nothing left on it.
    animations.forEach((animation) => animation.cancel());
  };

  return {
    commit() {
      if (state !== 'flying') {
        return;
      }
      state = 'settling'; // (refuses a second call while the render is awaited)
      afterNextRender(finish);
    },

    revert() {
      if (state !== 'flying') {
        return;
      }
      state = 'settling';
      // `reverse()` plays each animation backwards from where it has got to — finished or not.
      animations.forEach((animation) => animation.reverse());
      const settled = animations.map((animation) => animation.finished.catch(() => undefined));
      void Promise.all(settled).then(finish);
      // However the animations end (or never do: a hidden window), nothing stays on the items.
      timers.push(setTimeout(finish, CONVERGENCE_DURATION_MS + CONVERGENCE_MAX_STAGGERED * CONVERGENCE_STAGGER_MS + 200));
    },

    dispose: finish,
  };
}
