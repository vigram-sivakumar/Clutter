import { useEffect, useRef, useSyncExternalStore, type MutableRefObject } from 'react';
import { createDragAutoScroller, findScrollContainer, type ActiveDrag } from '@shared/interaction';
import {
  collectDragRows,
  collectDropDestinations,
  draggedItems,
  resolveDropTarget,
  wholeDragOracles,
  type DragItem,
  type DropTarget,
} from './dropTarget';
import type { DropTargetStore } from './dropTargetStore';
import { dragRevealStore } from './dragRevealStore';

/** How long a drag must rest on a collapsed "N more" row before the hidden items are revealed for the rest of the drag. */
export const DRAG_REVEAL_DELAY_MS = 500;

/** The collapsed "N more" row under the pointer, by cap key (only drag-enabled lists mark theirs). */
function showMoreCapKeyAt(pointer: { x: number; y: number }): string | null {
  for (const element of document.querySelectorAll<HTMLElement>('[data-cap-key]')) {
    const rect = element.getBoundingClientRect();
    if (pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y < rect.bottom) {
      return element.dataset.capKey ?? null;
    }
  }
  return null;
}

export interface DropTargetOracles {
  readonly canMoveFolderInto?: (folderId: string, destinationFolderId: string | null) => boolean;
  readonly canMoveNoteInto?: (pageId: string, destinationFolderId: string | null) => boolean;
}

/**
 * The ONE place a drag finds out where it would land and shows it — for a drag that began anywhere (a sidebar
 * row, a Collection View card or note row). While `drag` is on it, on every pointer move and every scroll:
 *
 *  - resolves the target with `resolveDropTarget` over every drop destination in the document (the sidebar's
 *    rows and positions, the Collection View's folder cards, the Templates/Inbox/Assets entries) — nothing in
 *    the resolution reads where the item came from;
 *  - shows it through `store` and keeps it in `lastShownTargetRef`, which is what a release acts on;
 *  - scrolls the list under the pointer (the sidebar's, the Collection View's — not only the one the drag began in) when the pointer rests near its edge (its re-resolve each frame);
 *  - reveals a list's hidden items when the pointer rests on its collapsed "N more" row for
 *    `DRAG_REVEAL_DELAY_MS`, for the rest of the drag, and re-resolves when they appear.
 *
 * Everything is undone when the drag ends, however it ends.
 */
export function useDropTargetTracking(
  drag: ActiveDrag<DragItem> | null,
  store: DropTargetStore,
  lastShownTargetRef: MutableRefObject<DropTarget | null>,
  oracles: () => DropTargetOracles
): void {
  const oraclesRef = useRef(oracles);
  oraclesRef.current = oracles;
  const updateRef = useRef<(() => void) | null>(null);

  // Revealed items exist only AFTER the trees re-render, so the target is re-resolved from an effect on that
  // state (not from the store's synchronous notification, which would still see the old rows).
  const revealed = useSyncExternalStore(dragRevealStore.subscribe, dragRevealStore.get);
  useEffect(() => {
    updateRef.current?.();
  }, [revealed]);

  useEffect(() => {
    if (!drag) {
      return;
    }
    const { session, payload } = drag;
    const parent = session.source.dataset.dragParent;
    const dragged: DragItem = { kind: payload.kind, id: payload.id, parentId: parent ? parent : null, items: payload.items };

    // Resting on a collapsed "N more" row reveals its hidden items for the rest of the drag.
    let hoveredCap: string | null = null;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;
    const watchShowMore = () => {
      const capKey = showMoreCapKeyAt(session.pointer);
      if (capKey === hoveredCap) {
        return;
      }
      clearTimeout(revealTimer);
      hoveredCap = capKey;
      if (capKey !== null) {
        revealTimer = setTimeout(() => dragRevealStore.reveal(capKey), DRAG_REVEAL_DELAY_MS);
      }
    };

    const update = () => {
      watchShowMore();
      // A drag of several items is offered a destination only where every item of it can go (see wholeDragOracles).
      const whole = wholeDragOracles(draggedItems(dragged), oraclesRef.current());
      const { canMoveFolderInto, canMoveNoteInto } = oraclesRef.current();
      const next = resolveDropTarget({
        pointer: session.pointer,
        dragged,
        rows: collectDragRows(),
        destinations: collectDropDestinations(),
        canMoveFolderInto: dragged.items ? whole.canMoveFolderInto : (folderId, destinationId) => canMoveFolderInto?.(folderId, destinationId) ?? false,
        canMoveNoteInto: dragged.items
          ? whole.canMoveNoteInto
          : canMoveNoteInto && ((pageId, destinationId) => canMoveNoteInto(pageId, destinationId) ?? false),
      });
      lastShownTargetRef.current = next;
      store.set(next);
      scroller?.poke();
    };

    // Near the top or bottom of the scrollable list under the pointer, it scrolls toward the pointer;
    // each frame that moved it re-resolves the target, since the rows under a stationary pointer changed.
    // The areas that can scroll are those holding any drop row — the sidebar's, the Collection View's — so a drag
    // held near the sidebar's edge scrolls the sidebar whichever list it began in.
    const scrollContainers = new Set<HTMLElement>();
    for (const element of [session.source, ...document.querySelectorAll<HTMLElement>('[data-drag-id]')]) {
      const container = findScrollContainer(element);
      if (container) {
        scrollContainers.add(container);
      }
    }
    const scroller = scrollContainers.size > 0 ? createDragAutoScroller([...scrollContainers], () => session.pointer, () => update()) : null;

    updateRef.current = update;
    update();
    const unsubscribe = session.subscribe(update);
    document.addEventListener('scroll', update, true);

    return () => {
      unsubscribe();
      updateRef.current = null;
      document.removeEventListener('scroll', update, true);
      clearTimeout(revealTimer);
      scroller?.stop();
      dragRevealStore.clear();
      lastShownTargetRef.current = null;
      store.set(null);
    };
  }, [drag, store, lastShownTargetRef]);
}
