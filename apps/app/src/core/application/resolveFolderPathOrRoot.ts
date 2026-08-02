import type { Vault } from '../vault/models/Vault';

/**
 * Resolves a destination folder id to its path, or the vault root when
 * null, throwing if the id doesn't exist. Shared by PagePathResolver and
 * FolderPathResolver — both need to turn "create under this folder, or
 * the root" into a concrete path before computing a collision-free name
 * underneath it; previously duplicated identically in both.
 */
export function resolveFolderPathOrRoot(
  vault: Vault,
  folderId: string | null
): string {
  if (folderId === null) {
    return vault.root;
  }

  const folder = vault.getFolder(folderId);

  if (!folder) {
    throw new Error(`Folder not found: ${folderId}`);
  }

  return folder.path;
}
