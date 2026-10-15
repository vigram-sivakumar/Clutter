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

/** The compact ghost width, for a source that opts in with `data-drag-ghost-size="compact"`. */
export const DRAG_GHOST_WIDTH_PX = 256;

interface DragGhostProps {
  readonly session: PointerDragSession;
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
export function DragGhost({ session }: DragGhostProps) {
  const ghostRef = useRef<HTMLDivElement>(null);

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

    const place = () => {
      const { source, pointer, grabOffsetY } = session;
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
        ghost.style.left = '0px';
        ghost.style.transform = `translate3d(${pointer.x - (width ?? ghost.offsetWidth) / 2}px, ${pointer.y - height / 2}px, 0)`;
        return;
      }

      if (rect) {
        ghost.style.left = `${rect.left}px`;
      }
      ghost.style.transform = `translate3d(0, ${pointer.y - grabOffsetY}px, 0)`;
    };

    place();
    const unsubscribe = session.subscribe(place);
    window.addEventListener('resize', place);

    return () => {
      unsubscribe();
      window.removeEventListener('resize', place);
    };
  }, [session]);

  return createPortal(<div ref={ghostRef} className="drag-ghost" aria-hidden="true" />, document.body);
}
