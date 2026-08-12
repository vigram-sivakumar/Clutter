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

export function getFolderDeleteConfirmation(
  vault: Vault,
  folderId: string
): FolderActionConfirmation {
  return describeFolderAction(
    vault,
    folderId,
    (folderCount, pageCount) =>
      `Delete this folder and everything inside it? This will permanently delete ${folderCount} folder(s) and ${pageCount} page(s). This cannot be undone.`
  );
}
