import type { Vault } from '@core/vault/models/Vault';

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
      `Archive this folder and everything inside it? This will also archive ${folderCount} folder(s) and ${pageCount} page(s).`
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
      ? 'This cannot be undone.'
      : `Delete this folder and everything inside it? This will permanently delete ${folderCount} folder(s) and ${pageCount} page(s). This cannot be undone.`
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
export const PAGE_DELETE_CONFIRMATION_MESSAGE = 'This cannot be undone.';
