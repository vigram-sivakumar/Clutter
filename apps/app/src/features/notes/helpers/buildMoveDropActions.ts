import type { DropActions, MoveOptions } from '@features/notes/sidebar/executeDrop';
import { forgetInLevelOrder, levelOrderContextFor, placeSiblingInLevel } from '@features/notes/sidebar/sidebarOrderActions';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { CollectionViewConfigStore } from '@core/application/collection/CollectionViewConfigStore';
import type { Vault } from '@core/vault/models/Vault';
import type { ToastApi } from '@components/toast/ToastProvider';
import { reportMoveFailure } from './reportMoveFailure';

/**
 * Shared UI move orchestration for note/folder menus and drops. Facades still own
 * the move; only a successful cross-parent move forgets a saved position when
 * the caller owns level ordering. Menus settle the promise, drops observe it.
 */
export function buildNoteFolderMoveActions(
  { vault, pageOperations, folderOperations }: {
    readonly vault: Pick<Vault, 'getPage' | 'getFolder'>;
    readonly pageOperations: Pick<PageOperations, 'move'>;
    readonly folderOperations: Pick<FolderOperations, 'move'>;
  },
  toast: ToastApi,
  onItemLeftLevel?: (parentId: string | null, kind: 'note' | 'folder', id: string) => void
) {
  async function move(kind: 'note' | 'folder', id: string, destinationFolderId: string | null, options?: MoveOptions): Promise<void> {
    const from = onItemLeftLevel
      ? (kind === 'note' ? vault.getPage(id) : vault.getFolder(id))?.parentId ?? null
      : null;
    try {
      if (kind === 'note') {
        await pageOperations.move(id, destinationFolderId);
      } else {
        await folderOperations.move(id, destinationFolderId);
      }
    } catch (error) {
      if (!options?.silent) {
        reportMoveFailure(toast, kind, error);
      }
      throw error;
    }
    if (from !== destinationFolderId) {
      onItemLeftLevel?.(from, kind, id);
    }
  }

  return {
    onMoveNote: (id: string, destinationFolderId: string | null, options?: MoveOptions) =>
      move('note', id, destinationFolderId, options),
    onMoveFolder: (id: string, destinationFolderId: string | null, options?: MoveOptions) =>
      move('folder', id, destinationFolderId, options),
  };
}

/**
 * What a drop does, for a drag that began OUTSIDE the sidebar tree (a Collection View's card or note row): the
 * same handlers and rule checks the Move picker and the sidebar tree's own drops use — PageOperations.move /
 * canMove and FolderOperations.move / canMove, the old parent forgetting a moved item's saved position, and a
 * positional drop written by `placeSiblingInLevel` (Manual mode and order in one update). The sidebar tree
 * calls the same functions, so a drop has the identical outcome whichever surface it began on: where the item
 * came from is the only thing that differs, and it is the item's own identity, never part of the destination.
 */
export function buildMoveDropActions(application: {
  readonly vault: Pick<Vault, 'getPage' | 'getFolder'>;
  readonly pageOperations: Pick<PageOperations, 'move' | 'canMove'>;
  readonly folderOperations: Pick<FolderOperations, 'move' | 'canMove'>;
  readonly membershipSelector: MembershipSelector;
  readonly collectionViewConfigStore: CollectionViewConfigStore;
}, toast: ToastApi): DropActions {
  const { pageOperations, folderOperations, membershipSelector, collectionViewConfigStore: store } = application;
  const levelOrder = levelOrderContextFor(store, membershipSelector);

  return {
    ...buildNoteFolderMoveActions(application, toast, (parentId, kind, id) =>
      forgetInLevelOrder(store, parentId, kind, id)
    ),
    canMoveFolderInto: (folderId, destinationFolderId) => folderOperations.canMove(folderId, destinationFolderId),
    canMoveNoteInto: (pageId, destinationFolderId) => pageOperations.canMove(pageId, destinationFolderId),
    canReorderLevel: (parentId) => levelOrder.getSort(parentId)?.key === 'manual',
    placeSibling: (item, parentId, anchor, edge) => placeSiblingInLevel(levelOrder, item, parentId, anchor, edge),
  };
}
