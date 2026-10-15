import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { PointerDragSession } from '@shared/interaction';
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
const STRIPPED_CLASSES = ['entry-interactive', 'entry-force-hover'];

function prepareSnapshot(snapshot: HTMLElement): HTMLElement {
  const nodes = [snapshot, ...Array.from(snapshot.querySelectorAll<HTMLElement>('*'))];
  for (const node of nodes) {
    STRIPPED_ATTRIBUTES.forEach((attribute) => node.removeAttribute(attribute));
    node.classList.remove(...STRIPPED_CLASSES);
  }
  return snapshot;
}

interface DragGhostProps {
  readonly session: PointerDragSession;
}

/**
 * A floating picture of the dragged element: the clone `usePointerDrag` took of it, drawn in a fixed
 * layer above the app. Reusable by any dragged row.
 *
 * - Size and horizontal position come from the SOURCE element, re-measured on every pointer move
 *   and window resize — so the ghost is always exactly the row's width and height, aligned with the
 *   sidebar's content area, and stays correct while the sidebar is resized or scrolled.
 * - Only the vertical position follows the pointer (`pointer.y - grabOffsetY`: the same grip on the
 *   row the user took). Moves are written straight to the element's `transform`, never through React state.
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

    const place = () => {
      const { source, pointer, grabOffsetY } = session;
      if (source.isConnected) {
        const rect = source.getBoundingClientRect();
        ghost.style.left = `${rect.left}px`;
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
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
