import type { Vault } from '@core/vault/models/Vault';
import type { FolderOperations } from '@core/application/folder/FolderOperations';

/**
 * ADR-024's resolved product decision #1: a non-empty folder's delete
 * requires confirmation (unbounded, silent blast radius), an empty one
 * doesn't. This is a UI-layer decision only — FolderOperations.delete()
 * itself remains an unconditional cascade once called; the descendant
 * count is a plain Vault read, the same subtree Vault.removeFolder()'s
 * own cascade already walks. The one implementation both PageHost's
 * folder topbar delete and the sidebar's folder context menu delete call,
 * so the confirm copy and the "what counts as non-empty" check exist in
 * exactly one place.
 */
export async function deleteFolderWithConfirmation(
  vault: Vault,
  folderOperations: FolderOperations,
  folderId: string
): Promise<boolean> {
  const { folders, pages } = vault.getDescendantFoldersAndPages(folderId);
  const hasDescendants = folders.length > 0 || pages.length > 0;

  if (hasDescendants) {
    const confirmed = window.confirm(
      `Delete this folder and everything inside it? This will permanently delete ${folders.length} folder(s) and ${pages.length} page(s). This cannot be undone.`
    );

    if (!confirmed) {
      return false;
    }
  }

  await folderOperations.delete(folderId);
  return true;
}
