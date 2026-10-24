import type { Application } from '@core/application/Application';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';
import type { CopyNotifier } from '@shared/helpers/copyWithFeedback';
import { moveZoneFor } from '@core/presentation/resourceActions/moveZoneFor';
import { buildMoveDestinationItems } from '@features/notes/helpers/buildMoveDestinationItems';
import { createFolderInZone } from '@features/notes/helpers/createFolderInZone';
import {
  getFolderArchiveConfirmation,
  getFolderDeleteConfirmation,
  PAGE_DELETE_CONFIRMATION_MESSAGE,
} from '@features/notes/helpers/folderActionConfirmation';

import type { BuildTopBarActionsOptions } from './buildTopBarActions';

/**
 * The page- and folder-level operations a More actions menu runs that need the host's own state
 * (restore's conflict dialog, delete's cache clearing, duplicate-and-open), keyed by the id of the
 * resource acted on. The host (PageHost) owns them once; both the topbar and the Collection View's
 * right-click menu receive the same set.
 */
export interface ResourceMenuOps {
  archivePage(pageId: string): void;
  restorePage(pageId: string): void;
  deletePage(pageId: string): void;
  duplicatePage(pageId: string): void;
  restoreFolder(folderId: string): void;
  archiveFolder(folderId: string): void;
  deleteFolder(folderId: string): void;
  /** A move that fails is reported by the host, which owns the toast. */
  movePage(pageId: string, destinationFolderId: string | null): void;
  moveFolder(folderId: string, destinationFolderId: string | null): void;
  /** Confirms or reports Copy path. */
  notifier?: CopyNotifier;
  /** Opens the Save as template dialog; absent where no host provides it. */
  createTemplate?(pageId: string): void;
}

function isPage(resource: Page | Folder): resource is Page {
  return 'type' in resource;
}

/**
 * Everything a resource's More actions menu is wired to, for ANY resource — the one place a note's or
 * folder's menu options (operations, confirmations, Move destinations) are assembled. The topbar
 * passes the open resource and adds its page-only extras (References, Delete all); the Collection
 * View's right-click menu passes the right-clicked one. Adding a wired action means editing here once.
 */
export function buildResourceMenuOptions(
  application: Application,
  resource: Page | Folder,
  ops: ResourceMenuOps
): BuildTopBarActionsOptions {
  const { membershipSelector, folderOperations, pageOperations, vault } = application;
  const id = resource.id;
  const base = { membershipSelector, vaultRoot: vault.root, notifier: ops.notifier };

  if (isPage(resource)) {
    // Move applies only to Notes (a Daily Note's menu never includes `move-to`); a Template is a note
    // like any other for Move (ADR-049, amended).
    const canMove = resource.type === 'note';

    return {
      ...base,
      onArchive: () => ops.archivePage(id),
      onRestore: () => ops.restorePage(id),
      onDelete: () => ops.deletePage(id),
      onDuplicate: () => ops.duplicatePage(id),
      onCreateTemplate: ops.createTemplate ? () => ops.createTemplate?.(id) : undefined,
      onToggleFavorite: () =>
        void pageOperations.updateMetadata(id, { favorite: !resource.metadata.favorite }),
      // A delete is only ever reachable for an archived/Archive-descendant page, and always confirms.
      deleteConfirmationMessage: PAGE_DELETE_CONFIRMATION_MESSAGE,
      moveDestinations: canMove ? buildMoveDestinationItems(membershipSelector) : undefined,
      onMove: canMove ? (destinationFolderId) => ops.movePage(id, destinationFolderId) : undefined,
      onCreateFolder: canMove ? (name) => folderOperations.create(name, null) : undefined,
    };
  }

  // A folder moves within the hierarchy it sits in (ADR-049): the same picker, rooted at Templates or
  // Assets for a folder inside one of them.
  const moveZone = moveZoneFor('folder', { moveZone: membershipSelector.getMoveZoneOfFolder(id) });

  return {
    ...base,
    onArchive: () => ops.archiveFolder(id),
    onRestore: () => ops.restoreFolder(id),
    onDelete: () => ops.deleteFolder(id),
    onToggleFavorite: () =>
      void folderOperations.updateMetadata(id, { favorite: !resource.metadata.favorite }),
    // Archiving a folder with contents confirms first; Delete always does.
    archiveConfirmationMessage: (() => {
      const confirmation = getFolderArchiveConfirmation(vault, id);
      return confirmation.hasDescendants ? confirmation.message : undefined;
    })(),
    deleteConfirmationMessage: getFolderDeleteConfirmation(vault, id).message,
    moveDestinations: buildMoveDestinationItems(membershipSelector, id, moveZone),
    onMove: (destinationFolderId) => ops.moveFolder(id, destinationFolderId),
    onCreateFolder: createFolderInZone(folderOperations, membershipSelector, moveZone),
  };
}
