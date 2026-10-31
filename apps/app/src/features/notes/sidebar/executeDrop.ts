import { DROP_ZONE_ACCEPTS, draggedItems, type DragItem, type DropTarget } from './dropTarget';

/** `silent`: a failed move is not reported (a drop of several items skips what cannot move and says nothing). */
export interface MoveOptions {
  readonly silent?: boolean;
}

/** The slice of the row actions a drop uses: the Move picker's own handlers, plus the move-rule check. */
export interface DropActions {
  onMoveNote(pageId: string, destinationFolderId: string | null, options?: MoveOptions): void | Promise<void>;
  onMoveFolder(folderId: string, destinationFolderId: string | null, options?: MoveOptions): void | Promise<void>;
  /** An asset (a file row): the Move picker's own handler for it — only ever called for the Assets destination. */
  onMoveResource?(resourceId: string, destinationFolderId: string | null): void | Promise<void>;
  canMoveFolderInto?(folderId: string, destinationFolderId: string | null): boolean;
  /** The note-move rules (PageOperations.canMove), re-asked at release. Absent: PageOperations.move's own validation decides. */
  canMoveNoteInto?(pageId: string, destinationFolderId: string | null): boolean;
  /** Writes the item's place among `parentId`'s children (the sidebar's manual order) — presentation state, never a move. */
  placeSibling?(
    item: DragItem,
    parentId: string | null,
    anchor: { kind: 'folder' | 'note'; id: string },
    edge: 'before' | 'after'
  ): void;
}

/**
 * For the Move picker, which has no use for the move's promise: a move that fails has already been reported
 * by the handler (which rethrows only so a drop can tell), so the rejection is settled here instead of
 * surfacing as unhandled.
 */
export function settleMove(move: void | Promise<void>): void {
  void Promise.resolve(move).catch(() => undefined);
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
    const items = draggedItems(item);

    // Eligibility is decided again here, from the rule itself — the target that was drawn is not trusted
    // to have been valid. A special destination takes only what it accepts — of a drag of several items, ALL
    // of them, or nothing moves — and an asset goes nowhere else.
    if (target.kind === 'inside' && target.zone) {
      const refused = items.find((dragged) => !DROP_ZONE_ACCEPTS[target.zone!].includes(dragged.kind));
      if (refused) {
        throw new Error(`The ${target.zone} destination does not accept a ${refused.kind}`);
      }
    }
    if (item.kind === 'asset' && !(target.kind === 'inside' && target.zone === 'assets')) {
      throw new Error('An asset can only be dropped onto Assets');
    }

    if (target.kind === 'inside') {
      if (item.items) {
        return await moveManyInto(items, target.folderId, actions);
      }
      // Dropping an item where it already is would change nothing.
      if (item.parentId === target.folderId) {
        return 'ignored';
      }
      await moveInto(item, target.folderId, actions);
      return 'moved';
    }

    // Several items are only ever dropped INTO a folder (a Collection View has no manual order).
    if (item.items) {
      return 'ignored';
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

/**
 * A drop of several items INTO a folder. Items already there are skipped (a no-op, not a failure). Every
 * dragged folder is checked against the move rules first, as a whole — one the rules refuse (itself, a
 * descendant of itself or of another dragged folder, …) rejects the entire drop before anything moves.
 * Then each item moves on its own, through the same move as a single drop: one that cannot move (a note
 * the destination refuses, a name already taken, a failed move) is skipped silently and the rest carry on;
 * nothing already moved is undone, and no item is processed twice.
 */
async function moveManyInto(items: readonly DragItem[], destinationFolderId: string | null, actions: DropActions): Promise<DropOutcome> {
  const seen = new Set<string>();
  const movable = items.filter((item) => {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key) || item.parentId === destinationFolderId) {
      return false;
    }
    seen.add(key);
    return true;
  });

  if (movable.length === 0) {
    return 'ignored';
  }

  const refused = movable.find((item) => item.kind === 'folder' && !actions.canMoveFolderInto?.(item.id, destinationFolderId));
  if (refused) {
    throw new Error(`The move rules do not allow ${refused.id} into ${destinationFolderId ?? 'the vault root'}`);
  }

  let moved = 0;
  for (const item of movable) {
    try {
      await moveInto(item, destinationFolderId, actions, { silent: true });
      moved += 1;
    } catch {
      // Skipped: nothing is reported and the others still move.
    }
  }

  return moved > 0 ? 'moved' : 'rejected';
}

/** The existing Move for the item. A folder only after the move rules are asked again; a "no" throws, so nothing after it runs. */
async function moveInto(item: DragItem, destinationFolderId: string | null, actions: DropActions, options?: MoveOptions): Promise<void> {
  if (item.kind === 'folder') {
    if (!actions.canMoveFolderInto?.(item.id, destinationFolderId)) {
      throw new Error(`The move rules do not allow ${item.id} into ${destinationFolderId ?? 'the vault root'}`);
    }
    await (options ? actions.onMoveFolder(item.id, destinationFolderId, options) : actions.onMoveFolder(item.id, destinationFolderId));
  } else if (item.kind === 'asset') {
    if (!actions.onMoveResource) {
      throw new Error('Assets cannot be moved from here');
    }
    await actions.onMoveResource(item.id, destinationFolderId);
  } else {
    if (actions.canMoveNoteInto && !actions.canMoveNoteInto(item.id, destinationFolderId)) {
      throw new Error(`The move rules do not allow ${item.id} into ${destinationFolderId ?? 'the vault root'}`);
    }
    await (options ? actions.onMoveNote(item.id, destinationFolderId, options) : actions.onMoveNote(item.id, destinationFolderId));
  }
}
