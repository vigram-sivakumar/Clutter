import type { DropActions } from '@features/notes/sidebar/executeDrop';
import { forgetInLevelOrder, levelOrderContextFor, placeSiblingInLevel } from '@features/notes/sidebar/sidebarOrderActions';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { CollectionViewConfigStore } from '@core/application/collection/CollectionViewConfigStore';
import type { Vault } from '@core/vault/models/Vault';
import type { ToastApi } from '@components/toast/ToastProvider';
import { reportMoveFailure } from './reportMoveFailure';

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
  const { vault, pageOperations, folderOperations, membershipSelector, collectionViewConfigStore: store } = application;
  const levelOrder = levelOrderContextFor(store, membershipSelector);

  return {
    onMoveNote: async (pageId, destinationFolderId) => {
      const from = vault.getPage(pageId)?.parentId ?? null;
      try {
        await pageOperations.move(pageId, destinationFolderId);
      } catch (error) {
        // Reported here, then rethrown so the drop is rejected and nothing after it runs.
        reportMoveFailure(toast, 'note', error);
        throw error;
      }
      // (Only reached when the move succeeded.)
      if (from !== destinationFolderId) {
        forgetInLevelOrder(store, from, 'note', pageId);
      }
    },
    onMoveFolder: async (folderId, destinationFolderId) => {
      const from = vault.getFolder(folderId)?.parentId ?? null;
      try {
        await folderOperations.move(folderId, destinationFolderId);
      } catch (error) {
        reportMoveFailure(toast, 'folder', error);
        throw error;
      }
      if (from !== destinationFolderId) {
        forgetInLevelOrder(store, from, 'folder', folderId);
      }
    },
    canMoveFolderInto: (folderId, destinationFolderId) => folderOperations.canMove(folderId, destinationFolderId),
    canMoveNoteInto: (pageId, destinationFolderId) => pageOperations.canMove(pageId, destinationFolderId),
    placeSibling: (item, parentId, anchor, edge) => placeSiblingInLevel(levelOrder, item, parentId, anchor, edge),
  };
}
