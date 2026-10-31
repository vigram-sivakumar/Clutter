import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { usePointerDrag, type ActiveDrag } from '@shared/interaction';
import { DragGhost } from '@components/drag-ghost/DragGhost';
import { draggedItems, type DragItem, type DropTarget } from '@features/notes/sidebar/dropTarget';
import { useDropTargetTracking } from '@features/notes/sidebar/useDropTargetTracking';
import { executeDrop, type DropActions } from '@features/notes/sidebar/executeDrop';
import { createDropTargetStore, DropFeedbackHost, type DropTargetStore } from '@features/notes/sidebar/dropTargetStore';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';
import { startConvergence, type Convergence } from './dragConvergence';

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
  /** Set on the entry being dragged: it stays in place but is invisible while its ghost follows the pointer. */
  readonly 'data-drag-source'?: 'true';
  /** A note row (table or list) can span the page, so its ghost is compact; a folder card keeps its own size. */
  readonly 'data-drag-ghost-size'?: 'compact';
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
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

  // The flight of the other checked items to the pressed one, for a drag of several (`dragConvergence.ts`). Started
  // when the drag really begins, settled by how it ends: a drop that did something leaves them to the collection's
  // update; Escape, a release with no valid drop and a refused drop all fly them back.
  const convergenceRef = useRef<Convergence | null>(null);
  // The ghost of a drag of several items AFTER the pointer has gone up or Escape was pressed: held where the cursor
  // left it while the drop is decided ('holding'), then — only if it was cancelled — flown back onto the original,
  // which stays hidden until it lands ('returning'). A drop that did something has no return: the ghost goes, and
  // the collection's update decides where everything is.
  const [after, setAfter] = useState<{ drag: ActiveDrag<DragItem>; phase: 'holding' | 'returning' } | null>(null);
  const lastDragRef = useRef<ActiveDrag<DragItem> | null>(null);
  const cancelDrag = (convergence: Convergence | null): void => {
    convergence?.revert();
    const last = lastDragRef.current;
    if (convergence && last?.payload.items) {
      setAfter({ drag: last, phase: 'returning' });
    }
  };
  const settle = (convergence: Convergence | null, outcome: 'moved' | 'reordered' | 'ignored' | 'rejected'): void => {
    if (convergence !== convergenceRef.current) {
      convergence?.dispose(); // a newer drag has taken over
    } else if (outcome === 'moved' || outcome === 'reordered') {
      convergence?.commit();
      setAfter(null);
    } else {
      cancelDrag(convergence);
    }
  };

  const { drag, press } = usePointerDrag<DragItem>({
    // A card can be dragged out of the page, onto the sidebar.
    allowDragOutsideContainer: true,
    onRelease: (item) => {
      // Consumed once: the move is for the target the user was last SHOWN, never a recalculation.
      const shown = lastShownTargetRef.current;
      lastShownTargetRef.current = null;
      const convergence = convergenceRef.current;
      if (convergence && lastDragRef.current?.payload.items) {
        setAfter({ drag: lastDragRef.current, phase: 'holding' }); // in the same update that removes the drag's own ghost
      }
      void executeDrop(item, shown, configRef.current?.actions).then((outcome) => settle(convergence, outcome));
    },
    onCancel: () => {
      lastShownTargetRef.current = null;
      cancelDrag(convergenceRef.current);
    },
  });

  // Before the first paint of the drag, while every item is still where it was.
  useLayoutEffect(() => {
    const payload = drag?.payload;
    if (!drag || !payload?.items) {
      return;
    }
    lastDragRef.current = drag;
    setAfter(null); // nor a previous drag's ghost still held or flying back
    convergenceRef.current?.dispose(); // never let one drag's animation linger into the next
    const byId = new Map<string, HTMLElement>();
    document.querySelectorAll<HTMLElement>('[data-drag-inside-only="true"][data-drag-id]').forEach((element) => {
      byId.set(`${element.dataset.dragKind}:${element.dataset.dragId}`, element);
    });
    const others = draggedItems(payload)
      .filter((item) => !(item.kind === payload.kind && item.id === payload.id))
      .map((item) => byId.get(`${item.kind}:${item.id}`))
      .filter((element): element is HTMLElement => element !== undefined);
    // The destination is the ghost (the drag's own, drawn in this same render), not the card that was pressed.
    convergenceRef.current = startConvergence(others, drag.session, document.querySelector('.drag-ghost'));
  }, [drag?.session]);

  useEffect(() => () => convergenceRef.current?.dispose(), []);

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
        // (Still hidden while a cancelled drag's ghost is flying back to it.)
        'data-drag-source':
          (drag ?? after?.drag)?.payload.kind === entry.type && (drag ?? after?.drag)?.payload.id === entry.id ? 'true' : undefined,
        onPointerDown: (event) => press(event, dragItemFor(entry, config.parentId, selected)),
      };
    },
    overlay: drag ? (
      <>
        <DragGhost session={drag.session} count={drag.payload.items?.length} settle={drag.payload.items !== undefined} />
        <DropFeedbackHost store={store} />
      </>
    ) : after ? (
      after.phase === 'returning' ? (
        <DragGhost key="return" session={after.drag.session} returning={{ onDone: () => setAfter(null) }} />
      ) : (
        <DragGhost key="hold" session={after.drag.session} count={after.drag.payload.items?.length} />
      )
    ) : null,
  };
}
