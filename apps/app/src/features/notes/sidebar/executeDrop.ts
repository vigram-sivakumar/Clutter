import type { DragItem, DropTarget } from './dropTarget';

/** The slice of the row actions a drop uses: the Move picker's own handlers, plus the move-rule check. */
export interface DropActions {
  onMoveNote(pageId: string, destinationFolderId: string | null): void | Promise<void>;
  onMoveFolder(folderId: string, destinationFolderId: string | null): void | Promise<void>;
  canMoveFolderInto?(folderId: string, destinationFolderId: string | null): boolean;
  /** Writes the item's place among `parentId`'s children (the sidebar's manual order) — presentation state, never a move. */
  placeSibling?(
    item: DragItem,
    parentId: string | null,
    anchor: { kind: DragItem['kind']; id: string },
    edge: 'before' | 'after'
  ): void;
}

export type DropOutcome = 'moved' | 'reordered' | 'ignored' | 'rejected';

/**
 * Carries out the drop for the target the user was last SHOWN:
 * - "inside" a folder moves the item there;
 * - an insertion position places the item among that parent's children (moving it there first when it
 *   comes from another parent);
 * - no target does nothing.
 *
 * It owns no move logic. A note goes through `onMoveNote` and a folder through `onMoveFolder` — the same
 * handlers the Move picker calls, i.e. PageOperations.move / FolderOperations.move, which resolve the
 * path, validate, keep identity and write through the Persistence Gate. A folder is re-checked with the
 * move rules (`canMoveFolderInto` = FolderOperations.canMove) at release, since state may have changed
 * since the target was drawn; a note has no pre-check, its own move() validates. Ordering is written
 * only after a needed move has succeeded, so a failed move leaves the order untouched.
 *
 * Like the Move picker, a rejected move just leaves the item where it was. The rejection is caught here
 * (the picker's `void` call leaves it unhandled) so it can never surface as an unhandled promise.
 */
export async function executeDrop(
  item: DragItem,
  target: DropTarget | null,
  actions: DropActions | undefined
): Promise<DropOutcome> {
  if (!actions || !target) {
    return 'ignored';
  }

  try {
    if (target.kind === 'inside') {
      await moveInto(item, target.folderId, actions);
      return 'moved';
    }

    // A note always belongs to a folder: it is never placed in the root list.
    if (!actions.placeSibling || (item.kind === 'note' && target.parentId === null)) {
      return 'ignored';
    }

    const crossesParents = target.parentId !== item.parentId;
    if (crossesParents) {
      await moveInto(item, target.parentId, actions);
    }
    actions.placeSibling(item, target.parentId, { kind: target.rowKind, id: target.rowId }, target.edge);
    return crossesParents ? 'moved' : 'reordered';
  } catch (error) {
    console.warn(`Drop of ${item.kind} ${item.id} was rejected:`, error);
    return 'rejected';
  }
}

/** The existing Move for the item. A folder only after the move rules are asked again; a "no" throws, so nothing after it runs. */
async function moveInto(item: DragItem, destinationFolderId: string | null, actions: DropActions): Promise<void> {
  if (item.kind === 'folder') {
    if (!actions.canMoveFolderInto?.(item.id, destinationFolderId)) {
      throw new Error(`The move rules do not allow ${item.id} into ${destinationFolderId ?? 'the vault root'}`);
    }
    await actions.onMoveFolder(item.id, destinationFolderId);
  } else {
    await actions.onMoveNote(item.id, destinationFolderId);
  }
}
