import type { Vault } from '../models/Vault';
import type { Folder } from '../models/Folder';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { FolderBuilder } from '../ingest/FolderBuilder';
import { ASSETS_DIRECTORY_NAME, ensureAssetsDirectory } from '../initialize/ensureAssetsDirectory';

/**
 * Ensures the managed Assets/ folder both exists on disk and is registered
 * as a tracked Vault Folder, returning it either way — the one place
 * Resource Restore's Assets/ fallback destination (§ resolveResourceRestoreDestination)
 * gets a real Folder id to use as `parentId`.
 *
 * Deliberately NOT modeled as a ReservedFolderId/reserved-folder ensure
 * (unlike Archive's ensureReservedFolderForOperation): Assets/ is ordinary,
 * fully-synced user vault content that MembershipSelector.isAssetsStorageFolder
 * merely hides from FolderTree presentation — see that method's own doc
 * comment for why it is deliberately not a reserved folder. This mirrors
 * that same decision rather than promoting Assets/ into
 * RESERVED_FOLDER_IDS/ReservedResources.ts.
 *
 * Reuses ensureAssetsDirectory() for the filesystem side (already the sole
 * writer of Assets/'s existence, shared with cover-image import) — this
 * function's only addition is the Vault-registration half that
 * ensureAssetsDirectory's existing callers never needed, since a cover
 * image is referenced by a raw path string, never through a tracked
 * Vault Folder/VaultResource the way a resource restore destination must
 * be.
 *
 * Idempotent, mirroring runEnsureReservedFolder's exact three-way shape:
 * already tracked in Vault -> return it unchanged; exists on disk but not
 * yet scanned -> register it now, no `.folder.md` (Assets/ carries no
 * identity file, same as a reserved folder recovered mid-session — see
 * FolderBuilder's `frontmatter: null` path-derived-id fallback); doesn't
 * exist at all -> create then register.
 */
export async function ensureAssetsFolder(
  vault: Vault,
  fileSystem: VaultFileSystem
): Promise<Folder> {
  const path = `${vault.root}/${ASSETS_DIRECTORY_NAME}`;

  const existing = vault.getFolderByPath(path);

  if (existing) {
    return existing;
  }

  await ensureAssetsDirectory(fileSystem, vault.root);

  const built = new FolderBuilder().build({
    parentId: null,
    directory: { path, parentPath: null, frontmatter: null },
  });

  vault.addFolder(built);

  return built;
}
