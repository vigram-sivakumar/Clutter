import { importAsset } from './asset/importAsset';
import type { VaultFileSystem } from './providers/VaultFileSystem';

/**
 * Copies an external image into `{vaultRoot}/Assets/` and returns the
 * vault-relative reference (`Assets/<filename>`) for frontmatter storage.
 * Non-Gate write — user vault files, not Page/Folder domain content.
 *
 * Delegates to the generic `importAsset` (core/vault/asset/importAsset.ts)
 * — this function's own body never had any cover-image-specific behavior
 * (no image validation, no cover-specific metadata), so extracting it was
 * a rename, not a generalization. Kept as its own named export, unchanged
 * in signature and behavior, so the cover-image feature's existing call
 * sites (`Application.importCoverAsset`) need no changes.
 */
export async function importCoverAsset(
  fileSystem: VaultFileSystem,
  vaultRoot: string,
  sourceAbsolutePath: string
): Promise<string> {
  return importAsset(fileSystem, vaultRoot, sourceAbsolutePath);
}
