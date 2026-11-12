import type { Vault } from '@core/vault/models/Vault';
import { ARCHIVE_ACTION_LABEL } from '@core/presentation/resourceActionLabels';

/**
 * The dialog wording for archiving a non-empty folder — one definition for the sidebar row's
 * confirmation surface and the topbar's ResourceTopBarActions (the message itself comes from
 * getFolderArchiveConfirmation below).
 */
export const FOLDER_ARCHIVE_CONFIRMATION_TITLE = 'Move this folder to archive?';
export const FOLDER_ARCHIVE_CONFIRM_LABEL = ARCHIVE_ACTION_LABEL;

/**
 * What Delete permanently's confirmation says about an item (ADR-072): it is moved to the macOS Trash, so it is not
 * gone for good and the copy must not say it is. The action keeps its name, "Delete permanently".
 */
export const DELETE_MOVES_TO_TRASH_MESSAGE = 'It will be moved to the macOS Trash, where you can restore it';

export interface FolderActionConfirmation {
  readonly hasDescendants: boolean;
  readonly message: string;
}

/**
 * The one place folder archive/delete confirmation copy is computed —
 * shared by every entry point (the sidebar row's confirmation surface and
 * the topbar's ResourceTopBarActions), so the "what counts as non-empty"
 * check and its wording exist in exactly one place per action, per
 * ADR-024's resolved product decision #1 (a non-empty folder's delete
 * requires confirmation, an empty one doesn't) — extended to archive by
 * ADR-026, same reasoning (unbounded, silent blast radius).
 */
function describeFolderAction(
  vault: Vault,
  folderId: string,
  describeMessage: (folderCount: number, pageCount: number) => string
): FolderActionConfirmation {
  const { folders, pages } = vault.getDescendantFoldersAndPages(folderId);
  const hasDescendants = folders.length > 0 || pages.length > 0;

  return {
    hasDescendants,
    message: describeMessage(folders.length, pages.length),
  };
}

export function getFolderArchiveConfirmation(
  vault: Vault,
  folderId: string
): FolderActionConfirmation {
  return describeFolderAction(
    vault,
    folderId,
    (folderCount, pageCount) =>
      `Move this folder and everything inside it to the archive? This will also move ${folderCount} folder(s) and ${pageCount} page(s)`
  );
}

/**
 * Unlike getFolderArchiveConfirmation, this is no longer gated on
 * `hasDescendants` by its caller (PageHost.tsx) — permanent Delete is only
 * ever reachable for a resource that is archived or a descendant of the
 * reserved Archive folder (buildTopBarActions.tsx's isDeletable), and every
 * such delete now requires confirmation regardless of whether the folder
 * being deleted is empty. `hasDescendants` is still returned (unused by the
 * delete caller today) only because describeFolderAction's shape is shared
 * with getFolderArchiveConfirmation, which still needs it.
 */
export function getFolderDeleteConfirmation(
  vault: Vault,
  folderId: string
): FolderActionConfirmation {
  return describeFolderAction(vault, folderId, (folderCount, pageCount) =>
    folderCount === 0 && pageCount === 0
      ? DELETE_MOVES_TO_TRASH_MESSAGE
      : `Delete this folder and everything inside it? This will move ${folderCount} folder(s) and ${pageCount} page(s) to the macOS Trash, where you can restore them`
  );
}

/**
 * The Note/Daily Note counterpart to getFolderDeleteConfirmation — a page
 * is always a leaf (no descendant count to compute), so this is a plain
 * constant rather than a function. Reached the same way: permanent Delete
 * is only ever available for an archived/Archive-descendant page
 * (buildTopBarActions.tsx's isDeletable), and every such delete now
 * requires confirmation.
 */
export const PAGE_DELETE_CONFIRMATION_MESSAGE = DELETE_MOVES_TO_TRASH_MESSAGE;
