import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { usePointerDrag } from '@shared/interaction';
import { createDragVisuals, type DragVisuals, type DragVisualsHandle } from '@components/drag-ghost/dragVisuals';
import { draggedItems, type DragItem, type DropTarget } from '@features/notes/sidebar/dropTarget';
import { useDropTargetTracking } from '@features/notes/sidebar/useDropTargetTracking';
import { executeDrop, type DropActions } from '@features/notes/sidebar/executeDrop';
import { createDropTargetStore, DropFeedbackHost, type DropTargetStore } from '@features/notes/sidebar/dropTargetStore';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

/**
 * What lets a Collection View's notes and folders be dragged into folders. Its presence is the capability
 * gate (like `onCreate`): a collection that is not an ordinary place to move things from — Daily Notes,
 * the Archive, a Tag, Favorites — passes none and its entries stay plain.
 */
export interface CollectionMoveDrag {
  /** The folder this collection lists the contents of (`null` = the vault root's). Every entry's parent. */
  readonly parentId: string | null;
  /** The same move handlers and rule checks the Move picker and the sidebar's drops use. */
  readonly actions: DropActions;
  /**
   * The folder is in Manual order and its notes are drawn as a one-column list (List, Table): a note row's edges
   * are then positions in that order, for a drag from the folder itself — which is how items are reordered here.
   * Folder cards are only ever places to move INTO.
   */
  readonly reorder?: boolean;
}

/** What an entry carries so any drag, from any surface, can find it as a destination. */
export interface CollectionDragEntryProps {
  readonly 'data-drag-kind': 'folder' | 'note';
  readonly 'data-drag-id': string;
  readonly 'data-drag-parent': string;
  /** A card is only ever a folder to move INTO; there is no manual order here (see DragRow.insideOnly). */
  readonly 'data-drag-inside-only': 'true';
  /** A note row of a Manual folder: its edges are positions in the folder's order (see `CollectionMoveDrag.reorder`). */
  readonly 'data-drag-reorder'?: 'true';
  /** A note row (table or list) can span the page, so its ghost is compact; a folder card keeps its own size. */
  readonly 'data-drag-ghost-size'?: 'compact';
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * The rendered elements of everything a drag carries other than the item the pointer took hold of — found by the
 * drag attributes every entry carries, whatever its layout. An item that is not mounted is simply not among them.
 */
function elementsOf(payload: DragItem): HTMLElement[] {
  const byId = new Map<string, HTMLElement>();
  document.querySelectorAll<HTMLElement>('[data-drag-inside-only="true"][data-drag-id]').forEach((element) => {
    byId.set(`${element.dataset.dragKind}:${element.dataset.dragId}`, element);
  });

  return draggedItems(payload)
    .filter((item) => !(item.kind === payload.kind && item.id === payload.id))
    .map((item) => byId.get(`${item.kind}:${item.id}`))
    .filter((element): element is HTMLElement => element !== undefined);
}

/**
 * What pressing `entry` drags. An entry that is checked takes every checked entry with it — itself first, the
 * others in the selection's order; an entry that is not checked is dragged alone, whatever else is selected.
 * A single checked entry is an ordinary single drag.
 */
function dragItemFor(entry: CollectionEntryModel, parentId: string | null, selected: readonly CollectionEntryModel[]): DragItem {
  const single: DragItem = { kind: entry.type as 'folder' | 'note', id: entry.id, parentId };
  const draggable = selected.filter((candidate) => (candidate.type === 'folder' || candidate.type === 'note') && candidate.tagLine === undefined);

  if (draggable.length < 2 || !draggable.some((candidate) => candidate.id === entry.id)) {
    return single;
  }

  const items: DragItem[] = [
    single,
    ...draggable
      .filter((candidate) => candidate.id !== entry.id)
      .map((candidate): DragItem => ({ kind: candidate.type as 'folder' | 'note', id: candidate.id, parentId })),
  ];

  return { ...single, items };
}

/**
 * Drag from a Collection View. It is the sidebar tree's own drag, started somewhere else: the same lifecycle
 * (`usePointerDrag`: threshold, ghost, Escape, click and text-selection suppression), the same tracking
 * (`useDropTargetTracking`: destinations and positions in the sidebar, folder cards in the page, Templates and
 * Inbox; indicators, auto-scroll, "N more" reveal) and the same executor (`executeDrop`, eligibility asked again
 * at the drop). Nothing here, and nothing downstream, reads where the drag began except the item's own
 * identity and parent — so every destination behaves identically for a drag from either surface.
 */
export function useCollectionMoveDrag(
  config: CollectionMoveDrag | undefined,
  /** The checked entries, in the selection's order. A drag that starts on one of them carries all of them. */
  selected: readonly CollectionEntryModel[] = []
): {
  /** Props for one entry's element, or `undefined` when the collection offers no drag (or for an entry that is neither a note nor a folder). */
  entryProps(entry: CollectionEntryModel): CollectionDragEntryProps | undefined;
  /** The ghost and the one drop indicator while a drag is on; render once, anywhere. */
  overlay: ReactNode;
} {
  const configRef = useRef(config);
  configRef.current = config;
  const lastShownTargetRef = useRef<DropTarget | null>(null);
  const storeRef = useRef<DropTargetStore>();
  storeRef.current ??= createDropTargetStore();
  const store = storeRef.current;

  // How the drag LOOKS is the shared drag-visual system's (`@components/drag-ghost/dragVisuals`) — the same for a
  // card, a list row or a table row, one item or several, a move or a reorder. This hook only tells it when a drag
  // begins and how it ended; it never draws, hides or animates anything itself.
  const visualsRef = useRef<DragVisuals>();
  visualsRef.current ??= createDragVisuals();
  const visuals = visualsRef.current;
  const handleRef = useRef<DragVisualsHandle | null>(null);

  const { drag, press } = usePointerDrag<DragItem>({
    // A card can be dragged out of the page, onto the sidebar.
    allowDragOutsideContainer: true,
    onRelease: (item) => {
      // Consumed once: the move is for the target the user was last SHOWN, never a recalculation.
      const shown = lastShownTargetRef.current;
      lastShownTargetRef.current = null;
      // This drag's handle: if another drag has begun by the time the drop settles, it does nothing.
      const handle = handleRef.current;
      handle?.release();
      void executeDrop(item, shown, configRef.current?.actions).then((outcome) => {
        // A drop that did something leaves everything to the collection's update; any other ending flies it all back.
        if (outcome === 'moved' || outcome === 'reordered') {
          handle?.commit();
        } else {
          handle?.cancel();
        }
      });
    },
    onCancel: () => {
      lastShownTargetRef.current = null;
      handleRef.current?.cancel();
    },
  });

  // The drag has really begun (the pointer-drag threshold is crossed): before its first paint, while every item is
  // still where it was. Every drag starts from nothing — `start` ends whatever an earlier one left on screen.
  useLayoutEffect(() => {
    if (!drag) {
      return;
    }
    handleRef.current = visuals.start(drag.session, elementsOf(drag.payload));
  }, [drag?.session]);

  useEffect(() => () => visuals.dispose(), []);

  useDropTargetTracking(drag, store, lastShownTargetRef, () => ({
    canMoveFolderInto: configRef.current?.actions.canMoveFolderInto,
    canMoveNoteInto: configRef.current?.actions.canMoveNoteInto,
    canReorderLevel: configRef.current?.actions.canReorderLevel,
  }));

  return {
    entryProps: (entry) => {
      if (!config || (entry.type !== 'folder' && entry.type !== 'note') || entry.tagLine !== undefined) {
        return undefined;
      }
      return {
        'data-drag-kind': entry.type,
        'data-drag-id': entry.id,
        'data-drag-parent': config.parentId ?? '',
        'data-drag-inside-only': 'true',
        'data-drag-reorder': entry.type === 'note' && config.reorder ? 'true' : undefined,
        'data-drag-ghost-size': entry.type === 'note' ? 'compact' : undefined,
        onPointerDown: (event) => press(event, dragItemFor(entry, config.parentId, selected)),
      };
    },
    // (The ghosts are the visual system's, in its own overlay; only the drop indicator is drawn here.)
    overlay: drag ? <DropFeedbackHost store={store} /> : null,
  };
}
