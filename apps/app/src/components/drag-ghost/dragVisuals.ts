/**
 * The ONE drag-visual system. A drag host (the sidebar tree, a Collection View, the property list) decides WHAT is
 * dragged and what a drop does; this decides how a drag LOOKS, in one place, for every layout and every operation:
 *
 *  - a SINGLE dragged item's original is hidden (`data-drag-source` + `visibility: hidden`, see DragGhost.css), which
 *    keeps it in the DOM and in layout and removes its border, shadows, outlines and pseudo-elements with it; when
 *    SEVERAL items are dragged every original stays as it is — visible, selected — and only the clones move (the rule is
 *    `DRAG_VISUAL_POLICY.hideOriginals`, here and nowhere else). Nothing is ever transformed or restyled inline on an
 *    original, in either case;
 *  - every dragged item is drawn as a temporary clone in ONE overlay owned here: the lead (the item the pointer took
 *    hold of) is the ghost that follows the pointer; the others converge on it; a count says how many;
 *  - only a clone's BACKGROUND fill changes in opacity — 100% on the original's place down to the token's value
 *    (`--drag-ghost-background-opacity`) as it travels to the cursor, and back up to 100% as it returns; the clone
 *    itself and its contents (text, icons, borders) are never made translucent, never faded in or out, and the
 *    surface colour stays the theme's (`--surface-tertiary`, see DragGhost.css);
 *  - cancelled, the clones fly back to where their originals are NOW (the layout may have changed meanwhile) from
 *    their current place and fill, and are removed only when they have arrived, and the originals are restored;
 *    dropped, the clones stay where the cursor left them until the collection has updated, then go with the hiding.
 *
 * Changing how dragging looks — not hiding the originals, a miniature grid instead of a count, a different
 * animation — is a change to this file and `DRAG_VISUAL_POLICY`, and affects every drag.
 *
 * Lifecycle: `start` returns a handle for THAT drag. `release` (the pointer went up, the drop is being decided),
 * `commit` (the drop did something), `cancel` (Escape, a pointer cancel, a release with no valid drop, a refused
 * drop) and `dispose` all end up in one idempotent `finish`, which removes the overlay and every clone, restores the
 * originals, cancels frames and timers and drops every reference. A handle of a superseded drag does nothing.
 * Cleanup never depends on animation frames: each way out is also on a timer.
 */
import { findScrollContainer, type PointerDragSession } from '@shared/interaction';
import './DragGhost.css';

/** Set to `compact` on a source whose ghost is `DRAG_GHOST_WIDTH_PX` wide instead of the source's own width (a Collection View table or list row, which can span the whole page). */
export const DRAG_GHOST_SIZE_ATTRIBUTE = 'data-drag-ghost-size';

/**
 * Set to `outside-container` on a source whose ghost stays pinned to its column (vertical movement only, the grip
 * kept) while the pointer is over the container it sits in, and follows the pointer freely only once the pointer
 * has left that container horizontally (a sidebar row dragged out to the page).
 */
export const DRAG_GHOST_FOLLOW_ATTRIBUTE = 'data-drag-ghost-follow';

/** The compact ghost width, for a source that opts in with `data-drag-ghost-size="compact"`. */
export const DRAG_GHOST_WIDTH_PX = 256;

/** The attribute that marks an original as hidden for the length of a drag (the rule is in DragGhost.css). */
export const DRAG_SOURCE_ATTRIBUTE = 'data-drag-source';

/** Every tunable of how a drag looks, in one place. */
export const DRAG_VISUAL_POLICY = {
  /** Whose originals are hidden while their clones are dragged: a single item's only; several items' all stay visible. */
  hideOriginals: 'single-item-drags',
  /** The ghost starts on the original and eases onto the cursor over this long (so nothing jumps when a drag begins). */
  settleMs: 160,
  /** A cancelled drag's clones fly back over this long. */
  returnMs: 220,
  /** The other items' flight to the ghost: each starts a little after the one before, for at most `maxStaggered`. */
  convergenceMs: 220,
  staggerMs: 16,
  maxStaggered: 8,
  /** The ghost's background fill, as a percentage of the surface colour, when it is on the original's place… */
  fillStartPercent: 100,
  /** …and what it eases to if the CSS token cannot be read. The token is `--drag-ghost-background-opacity`. */
  fillEndFallbackPercent: 50,
  /** Where the count rides, from the cursor. */
  countOffsetPx: 14,
  /** However an animation ends — or never does (a window that is not painted runs no frames) — everything is gone by then. */
  safetyMs: 300,
} as const;

export const DRAG_GHOST_SETTLE_MS = DRAG_VISUAL_POLICY.settleMs;
export const DRAG_GHOST_RETURN_MS = DRAG_VISUAL_POLICY.returnMs;

/** Attributes that must not be duplicated into a clone: it is a picture of the row, not a second row. */
const STRIPPED_ATTRIBUTES = [
  'id',
  'data-testid',
  'tabindex',
  'role',
  'aria-disabled',
  'aria-expanded',
];
const STRIPPED_CLASSES = ['entry-interactive', 'entry-force-hover'];

/** A clone made harmless: no ids to duplicate, nothing focusable, no marker another drag could take for a row. */
export function prepareClone(clone: HTMLElement): HTMLElement {
  for (const node of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))]) {
    STRIPPED_ATTRIBUTES.forEach((attribute) => node.removeAttribute(attribute));
    // Every drag and drop marker (`data-drag-*`, `data-drop-*`): the picture of a row must never be mistaken for a row.
    for (const { name } of Array.from(node.attributes)) {
      if (name.startsWith('data-drag') || name.startsWith('data-drop')) {
        node.removeAttribute(name);
      }
    }
    node.classList.remove(...STRIPPED_CLASSES);
  }
  return clone;
}

/** `--drag-ghost-background-opacity` in percent — the one place the fill's target is set (DragGhost.css). */
function readFillTarget(): number {
  const style = getComputedStyle(document.documentElement);
  const value = typeof style?.getPropertyValue === 'function' ? parseFloat(style.getPropertyValue('--drag-ghost-background-opacity')) : NaN;
  return Number.isFinite(value) ? value : DRAG_VISUAL_POLICY.fillEndFallbackPercent;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
/** Smooth acceleration and deceleration, no overshoot. */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Item {
  readonly source: HTMLElement;
  readonly element: HTMLDivElement;
  readonly lead: boolean;
  /** The original's own place when the drag began. */
  readonly origin: Box;
  readonly delay: number;
  /** What the attribute held before it was set here, put back at the end (`null`: it was absent). */
  readonly hadAttribute: string | null;
  /** What is drawn now. */
  box: Box;
  /** The background fill's opacity now, in percent. */
  fill: number;
}

export interface DragVisualsHandle {
  /** The pointer went up and the drop is being decided: the clones hold where they are. */
  release(): void;
  /** The drop did something: nothing flies back; the clones and the hiding end together once the collection has updated. */
  commit(): void;
  /** The drag was cancelled or its drop refused: everything flies back, then the originals are restored. */
  cancel(): void;
  /** End everything now, without animating. */
  dispose(): void;
}

export interface DragVisuals {
  /**
   * A drag has begun (the threshold is crossed): hide the originals, draw the clones. `others` are the other items of
   * a multi-item drag (those that are mounted — an item that is not is simply not drawn). Ends any drag before it.
   */
  start(session: PointerDragSession, others?: readonly HTMLElement[]): DragVisualsHandle;
  /** Ends whatever is on screen now. */
  dispose(): void;
}

/** After the next render has had its chance to update the collection. */
function afterNextRender(run: () => void): void {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(run));
  } else {
    setTimeout(run, 32);
  }
}

export function createDragVisuals(): DragVisuals {
  let finishCurrent: (() => void) | null = null;

  function start(session: PointerDragSession, others: readonly HTMLElement[] = []): DragVisualsHandle {
    finishCurrent?.(); // a new drag ends what the last one left (even an animation still flying back)

    const reduced = prefersReducedMotion();
    const policy = DRAG_VISUAL_POLICY;
    const lead = session.source;
    const pinsInside = lead.getAttribute(DRAG_GHOST_FOLLOW_ATTRIBUTE) === 'outside-container';
    const container = pinsInside ? findScrollContainer(lead) : null;

    // One overlay, owned here: every clone, and the count. Inert and aria-hidden: nothing in it takes focus or is announced.
    const overlay = document.createElement('div');
    overlay.className = 'drag-visuals';
    overlay.setAttribute('inert', '');
    overlay.setAttribute('aria-hidden', 'true');

    // The fill eases from `fillStartPercent` to the CSS token's value (read once); with reduced motion it is there at once.
    const fillEnd = readFillTarget();
    const fillAt = (share: number) => policy.fillStartPercent + (fillEnd - policy.fillStartPercent) * share;

    const compactWidth = (source: HTMLElement) => (session.allowDragOutsideContainer && source.getAttribute(DRAG_GHOST_SIZE_ATTRIBUTE) === 'compact' ? DRAG_GHOST_WIDTH_PX : undefined);

    // All the reads, once, before anything is written.
    const sources = [lead, ...others.filter((element) => element !== lead && element.isConnected)];
    const items: Item[] = sources.map((source, index) => {
      const rect = source.getBoundingClientRect();
      const element = document.createElement('div');
      element.className = 'drag-ghost';
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
      element.append(prepareClone(index === 0 ? session.snapshot : (source.cloneNode(true) as HTMLElement)));
      const origin: Box = { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      return {
        source,
        element,
        lead: index === 0,
        origin,
        delay: index === 0 || reduced ? 0 : Math.min(index - 1, policy.maxStaggered) * policy.staggerMs,
        hadAttribute: source.getAttribute(DRAG_SOURCE_ATTRIBUTE),
        box: { ...origin },
        fill: policy.fillStartPercent,
      };
    });
    const leadItem = items[0]!;
    // Reduced motion draws no convergence: the other items are only hidden (their count is on the pointer).
    const drawn = reduced ? [leadItem] : items;

    let count: HTMLDivElement | null = null;
    if (items.length > 1) {
      count = document.createElement('div');
      count.className = 'drag-ghost-count';
      count.textContent = String(items.length);
      overlay.append(count);
    }
    drawn.forEach((item) => overlay.append(item.element));

    // Then the writes: hide the originals (a single item's) and show the clones, in the same frame, so nothing jumps.
    const hidden = policy.hideOriginals === 'single-item-drags' && items.length === 1 ? items : [];
    hidden.forEach((item) => item.source.setAttribute(DRAG_SOURCE_ATTRIBUTE, 'true'));
    document.body.append(overlay);

    let phase: 'dragging' | 'holding' | 'returning' | 'committing' | 'finished' = 'dragging';
    let frameId: number | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let startedAt: number | null = null;
    let returnStartedAt: number | null = null;
    let returnFrom: Box[] = [];
    let returnFromFill: number[] = [];
    let restored = false;
    let unsubscribe: (() => void) | null = session.subscribe(() => render());

    /** Where the lead ghost would sit under the pointer now: centred on it, or kept in its column (a pinned sidebar row). */
    function leadTarget(): { box: Box; free: boolean } {
      const { pointer, grabOffsetY } = session;
      const rect = lead.isConnected ? lead.getBoundingClientRect() : null;
      const bounds = container?.isConnected ? container.getBoundingClientRect() : null;
      const inside = bounds !== null && pointer.x >= bounds.left && pointer.x <= bounds.right;
      const free = session.allowDragOutsideContainer && !(pinsInside && inside);
      const width = compactWidth(lead) ?? rect?.width ?? leadItem.origin.width;
      const height = rect?.height ?? leadItem.origin.height;

      return free
        ? { box: { x: pointer.x - width / 2, y: pointer.y - height / 2, width, height }, free }
        : { box: { x: rect?.left ?? leadItem.origin.x, y: pointer.y - grabOffsetY, width: rect?.width ?? width, height }, free };
    }

    function place(item: Item, box: Box, fill: number, free = true) {
      item.box = box;
      item.fill = fill;
      const style = item.element.style;
      style.width = `${box.width}px`;
      style.height = `${box.height}px`;
      // Only the background's alpha moves: a custom property the stylesheet mixes into `--surface-tertiary`.
      style.setProperty('--drag-ghost-fill-opacity', `${fill}%`);
      // A column-pinned lead keeps its own `left` and moves vertically only; everything else is placed by transform.
      style.left = free ? '0px' : `${box.x}px`;
      style.transform = free ? `translate3d(${box.x}px, ${box.y}px, 0)` : `translate3d(0, ${box.y}px, 0)`;
    }

    /** Draws everything for `now`. Called on every pointer move (so the ghost never lags) and, while something is animating, every frame. */
    function render(now: number = performance.now()) {
      if (phase === 'finished' || phase === 'holding') {
        return;
      }
      const { pointer } = session;
      let animating = false;

      if (phase === 'dragging') {
        startedAt ??= now;
        const elapsed = now - startedAt;
        const target = leadTarget();
        // The lead eases from the original's place onto the pointer (the pointer itself is followed from the first frame).
        const share = reduced || !target.free ? 1 : ease(clamp01(elapsed / policy.settleMs));
        // The background fill eases from its start value to the token's, in step with the settle onto the pointer.
        const fillShare = reduced ? 1 : ease(clamp01(elapsed / policy.settleMs));
        animating ||= share < 1 || fillShare < 1;
        place(
          leadItem,
          {
            x: leadItem.origin.x + (target.box.x - leadItem.origin.x) * share,
            y: leadItem.origin.y + (target.box.y - leadItem.origin.y) * share,
            width: leadItem.origin.width + (target.box.width - leadItem.origin.width) * share,
            height: target.box.height,
          },
          fillAt(fillShare),
          target.free
        );

        // The others converge on the lead's DRAWN centre — wherever it is on its way to the pointer.
        const centre = { x: leadItem.box.x + leadItem.box.width / 2, y: leadItem.box.y + leadItem.box.height / 2 };
        if (!reduced) {
          for (const item of items.slice(1)) {
            const progress = ease(clamp01((elapsed - item.delay) / policy.convergenceMs));
            animating ||= elapsed - item.delay < policy.convergenceMs;
            const fromX = item.origin.x + item.origin.width / 2;
            const fromY = item.origin.y + item.origin.height / 2;
            place(
              item,
              {
                x: item.origin.x + (centre.x - fromX) * progress,
                y: item.origin.y + (centre.y - fromY) * progress,
                width: item.origin.width,
                height: item.origin.height,
              },
              // The fill eases in step with the flight.
              fillAt(progress)
            );
          }
        }
        if (count) {
          count.style.transform = `translate3d(${pointer.x + policy.countOffsetPx}px, ${pointer.y + policy.countOffsetPx}px, 0)`;
        }
      } else if (phase === 'returning') {
        returnStartedAt ??= now;
        const progress = ease(clamp01((now - returnStartedAt) / policy.returnMs));
        drawn.forEach((item, index) => {
          // Back to where the original IS now: if the layout moved meanwhile, never to a stale coordinate.
          const rect = item.source.isConnected ? item.source.getBoundingClientRect() : null;
          const to: Box = rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : returnFrom[index]!;
          const from = returnFrom[index]!;
          place(
            item,
            {
              x: from.x + (to.x - from.x) * progress,
              y: from.y + (to.y - from.y) * progress,
              width: from.width + (to.width - from.width) * progress,
              height: from.height + (to.height - from.height) * progress,
            },
            // From the fill it has now back to the start value, together with the position.
            returnFromFill[index]! + (policy.fillStartPercent - returnFromFill[index]!) * progress,
            true
          );
        });
        if (progress >= 1) {
          finish();
          return;
        }
        animating = true;
      }

      if (animating && frameId === null) {
        frameId = requestAnimationFrame((time) => {
          frameId = null;
          render(time);
        });
      }
    }

    function stopFollowing() {
      unsubscribe?.();
      unsubscribe = null;
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    }

    /** Back to exactly what each hidden original had: the marker is only ever the hiding, never a style of its own. */
    function restoreOriginals() {
      if (restored) {
        return;
      }
      restored = true;
      for (const item of hidden) {
        if (item.hadAttribute === null) {
          item.source.removeAttribute(DRAG_SOURCE_ATTRIBUTE);
        } else {
          item.source.setAttribute(DRAG_SOURCE_ATTRIBUTE, item.hadAttribute);
        }
      }
    }

    /** The one way out. Idempotent. */
    function finish() {
      if (phase === 'finished') {
        return;
      }
      phase = 'finished';
      stopFollowing();
      timers.forEach(clearTimeout);
      timers.clear();
      overlay.remove(); // every clone and the count with it
      restoreOriginals();
      items.length = 0;
      if (finishCurrent === finish) {
        finishCurrent = null;
      }
    }
    finishCurrent = finish;

    render();

    return {
      release() {
        if (phase !== 'dragging') {
          return;
        }
        phase = 'holding';
        stopFollowing();
      },

      commit() {
        if (phase !== 'dragging' && phase !== 'holding') {
          return;
        }
        phase = 'committing';
        stopFollowing();
        // The clones stay where the cursor left them (no flight back, no fade) and the originals stay hidden until the
        // collection has rendered its update — then both go together, so neither a duplicate nor a gap shows. (Not on
        // frames alone: a window that is not painted has none.)
        afterNextRender(finish);
        timers.add(setTimeout(finish, policy.safetyMs));
      },

      cancel() {
        if (phase !== 'dragging' && phase !== 'holding') {
          return;
        }
        returnFrom = drawn.map((item) => ({ ...item.box }));
        returnFromFill = drawn.map((item) => item.fill);
        phase = 'returning';
        stopFollowing();
        if (reduced) {
          finish();
          return;
        }
        timers.add(setTimeout(finish, policy.returnMs + policy.safetyMs));
        // A clone landing on a HIDDEN original keeps the original's frame (it would otherwise be the one item without its
        // border until it arrived); one landing on a visible original does not (its frame is already there beneath).
        hidden.forEach((item) => item.element.classList.add('drag-ghost--returning'));
        render();
      },

      dispose: finish,
    };
  }

  return {
    start,
    dispose: () => finishCurrent?.(),
  };
}
