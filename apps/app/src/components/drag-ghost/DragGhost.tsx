import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { findScrollContainer, type PointerDragSession } from '@shared/interaction';
import './DragGhost.css';

/** Attributes that must not be duplicated into the ghost: it is a picture of the row, not a second row. */
const STRIPPED_ATTRIBUTES = [
  'id',
  'data-testid',
  'tabindex',
  'role',
  'aria-disabled',
  'aria-expanded',
  // Drop-target row markers: the picture of a row must never be mistaken for a row.
  'data-drag-kind',
  'data-drag-id',
  'data-drag-parent',
  'data-drag-tail-hidden',
];
/** Set to `compact` on a source whose ghost is `DRAG_GHOST_WIDTH_PX` wide instead of the source's own width (a Collection View table or list row, which can span the whole page). */
export const DRAG_GHOST_SIZE_ATTRIBUTE = 'data-drag-ghost-size';

/**
 * Set to `outside-container` on a source whose ghost stays pinned to its column (vertical movement only, the grip
 * kept) while the pointer is over the container it sits in, and follows the pointer freely only once the pointer
 * has left that container horizontally (a sidebar row dragged out to the page).
 */
export const DRAG_GHOST_FOLLOW_ATTRIBUTE = 'data-drag-ghost-follow';

const STRIPPED_CLASSES = ['entry-interactive', 'entry-force-hover'];

function prepareSnapshot(snapshot: HTMLElement): HTMLElement {
  const nodes = [snapshot, ...Array.from(snapshot.querySelectorAll<HTMLElement>('*'))];
  for (const node of nodes) {
    STRIPPED_ATTRIBUTES.forEach((attribute) => node.removeAttribute(attribute));
    node.classList.remove(...STRIPPED_CLASSES);
  }
  return snapshot;
}

/** How far the count badge sits from the cursor, right and down. */
const DRAG_COUNT_OFFSET_PX = 14;

/** The compact ghost width, for a source that opts in with `data-drag-ghost-size="compact"`. */
export const DRAG_GHOST_WIDTH_PX = 256;

/** How long the ghost takes to settle from the original's place onto the cursor, and (when cancelled) back. */
export const DRAG_GHOST_SETTLE_MS = 160;
export const DRAG_GHOST_RETURN_MS = 220;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface DragGhostProps {
  readonly session: PointerDragSession;
  /**
   * Starts the ghost exactly where (and as wide as) the original is and lets it settle onto the cursor, instead of
   * appearing already centred on it — so the dragged item does not jump when the drag begins. The pointer is tracked
   * from the first frame: only the share of the way the ghost has covered from the original's place grows with time,
   * so it can never lag behind the cursor once settled.
   */
  readonly settle?: boolean;
  /**
   * The drag was cancelled: instead of a drag, this ghost flies from where the cursor left it back to the original's
   * place (the original stays hidden until then), then calls `onDone`. A drop that did something has no such ghost.
   */
  readonly returning?: { onDone(): void };
  /** How many items the drag carries, shown as a badge on the ghost — only when it carries more than one. */
  readonly count?: number;
}

/**
 * A floating picture of the dragged element: the clone `usePointerDrag` took of it, drawn in a fixed
 * layer above the app. Reusable by any dragged row.
 *
 * - Its height always comes from the SOURCE element (re-measured on every pointer move and window resize).
 * - A source marked `data-drag-ghost-size="compact"` is drawn `DRAG_GHOST_WIDTH_PX` wide; any other keeps its own width.
 * - What it is and where it sits depend on the drag's `allowDragOutsideContainer` option. On, the ghost is
 *   the source's own width (or the compact one, above) and CENTRED under the cursor on both axes, wherever the source was, whatever the width
 *   of the container it came from, inside it or far outside it. Off (the default), it is the source's own
 *   width, stays in the source's column, and only the vertical position follows the pointer, keeping the
 *   grip the user took on the row.
 * - Moves are written straight to the element's `transform`, never through React state.
 * - It is never interactive (`pointer-events: none`, `inert`, `aria-hidden`) and out of layout
 *   (`position: fixed`), so it can neither intercept the pointer nor move anything.
 */
export function DragGhost({ session, count, settle = false, returning }: DragGhostProps) {
  const ghostRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const ghost = ghostRef.current;
    if (!ghost) {
      return;
    }

    // `inert` is not in React 18's typings; set as an attribute.
    ghost.setAttribute('inert', '');
    ghost.replaceChildren(prepareSnapshot(session.snapshot));

    const pinsInside = session.source.getAttribute(DRAG_GHOST_FOLLOW_ATTRIBUTE) === 'outside-container';
    const container = pinsInside ? findScrollContainer(session.source) : null;

    const reduced = prefersReducedMotion();
    const initialRect = session.source.isConnected ? session.source.getBoundingClientRect() : null;
    // The blend the ghost is in (if any): from the original's place onto the cursor, or from the cursor back to it.
    let blend: { readonly kind: 'enter' | 'return'; startedAt: number | null; from?: { x: number; y: number; width: number } } | null =
      reduced
        ? null
        : returning
          ? { kind: 'return', startedAt: null }
          : settle && initialRect
            ? { kind: 'enter', startedAt: null, from: { x: initialRect.left, y: initialRect.top, width: initialRect.width } }
            : null;
    let frameId: number | null = null;

    if (reduced && returning) {
      returning.onDone();
    }
    ghost.classList.toggle('drag-ghost--entering', blend?.kind === 'enter');
    ghost.classList.toggle('drag-ghost--returning', blend?.kind === 'return');

    const place = (now?: number) => {
      const { source, pointer, grabOffsetY } = session;
      // The count rides beside the cursor itself, wherever the ghost is.
      if (countRef.current) {
        countRef.current.style.transform = `translate3d(${pointer.x + DRAG_COUNT_OFFSET_PX}px, ${pointer.y + DRAG_COUNT_OFFSET_PX}px, 0)`;
      }
      const rect = source.isConnected ? source.getBoundingClientRect() : null;
      const bounds = container?.isConnected ? container.getBoundingClientRect() : null;
      const insideContainer = bounds !== null && pointer.x >= bounds.left && pointer.x <= bounds.right;
      const free = session.allowDragOutsideContainer && !(pinsInside && insideContainer);
      const compact = session.allowDragOutsideContainer && source.getAttribute(DRAG_GHOST_SIZE_ATTRIBUTE) === 'compact';
      const width = compact ? DRAG_GHOST_WIDTH_PX : rect?.width;
      if (width !== undefined) {
        ghost.style.width = `${width}px`;
      }
      if (rect) {
        ghost.style.height = `${rect.height}px`;
      }

      if (free) {
        // Centred on the cursor, from the ghost's own size — no source-relative offset anywhere.
        const height = rect?.height ?? ghost.offsetHeight;
        const finalWidth = width ?? ghost.offsetWidth;
        let x = pointer.x - finalWidth / 2;
        let y = pointer.y - height / 2;
        let drawnWidth = finalWidth;

        if (blend && rect) {
          blend.startedAt ??= now ?? performance.now();
          const duration = blend.kind === 'enter' ? DRAG_GHOST_SETTLE_MS : DRAG_GHOST_RETURN_MS;
          const progress = easeInOut(clamp01(((now ?? performance.now()) - blend.startedAt) / duration));
          // Entering: from the original's place onto the (live) cursor. Returning: from the cursor (where it was
          // cancelled) back onto the original's (live) place. Either way the end that follows the user is read live.
          const origin = blend.kind === 'enter' ? blend.from! : { x: rect.left, y: rect.top, width: rect.width };
          const share = blend.kind === 'enter' ? progress : 1 - progress;
          x = origin.x + (x - origin.x) * share;
          y = origin.y + (y - origin.y) * share;
          drawnWidth = origin.width + (finalWidth - origin.width) * share;
          ghost.style.width = `${drawnWidth}px`;

          if (progress >= 1) {
            const finished = blend.kind;
            blend = null;
            ghost.classList.remove('drag-ghost--entering');
            if (finished === 'return') {
              returning?.onDone();
            }
          }
        }
        ghost.style.left = '0px';
        ghost.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        return;
      }

      if (rect) {
        ghost.style.left = `${rect.left}px`;
      }
      ghost.style.transform = `translate3d(0, ${pointer.y - grabOffsetY}px, 0)`;
    };

    // While a blend runs, the ghost is redrawn every frame (the pointer may be still); afterwards only on pointer moves.
    const tick = (now: number) => {
      frameId = null;
      place(now);
      if (blend) {
        frameId = requestAnimationFrame(tick);
      }
    };
    const onPointer = () => place();

    place();
    if (blend) {
      frameId = requestAnimationFrame(tick);
    }
    const unsubscribe = session.subscribe(onPointer);
    window.addEventListener('resize', onPointer);

    return () => {
      unsubscribe();
      window.removeEventListener('resize', onPointer);
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `returning`'s callback is read once, at mount
  }, [session, count, settle]);

  return (
    <>
      {createPortal(<div ref={ghostRef} className="drag-ghost" aria-hidden="true" />, document.body)}
      {count !== undefined && count > 1 &&
        createPortal(
          <div ref={countRef} className="drag-ghost-count" aria-hidden="true">
            {count}
          </div>,
          document.body
        )}
    </>
  );
}
