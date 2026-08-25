import { resolveCollisionFreeName } from '../../shared/naming/resolveCollisionFreeName';
import { VaultPath } from '../ingest/VaultPath';
import { ASSETS_DIRECTORY_NAME, ensureAssetsDirectory } from '../initialize/ensureAssetsDirectory';
import type { VaultFileSystem } from '../providers/VaultFileSystem';

/**
 * Copies an external file into `{vaultRoot}/Assets/` and returns the
 * vault-relative reference (`Assets/<filename>`). The generic form of what
 * was previously `importCoverAsset`'s own body — that logic never actually
 * depended on the file being a cover image (no image-only validation, no
 * cover-specific metadata), so this is an extraction, not a
 * generalization: `importCoverAsset` now delegates here unchanged.
 *
 * Non-Gate write — an asset file never becomes a `Page`/`Folder` in the
 * Vault domain model, so it falls outside what the Persistence Gate
 * governs at all (ARCHITECTURE_RULES.md rule 2's own scope clause), the
 * same reasoning `importCoverAsset` already relied on.
 */
export async function importAsset(
  fileSystem: VaultFileSystem,
  vaultRoot: string,
  sourceAbsolutePath: string
): Promise<string> {
  await ensureAssetsDirectory(fileSystem, vaultRoot);

  const assetsDir = `${vaultRoot}/${ASSETS_DIRECTORY_NAME}`;
  const fileName = VaultPath.filename(sourceAbsolutePath);
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : '';

  const entries = await fileSystem.readDirectory(assetsDir);
  const existingNames = new Set(
    entries.filter((entry) => !entry.isDirectory).map((entry) => entry.name)
  );

  const uniqueBaseName = resolveCollisionFreeName(baseName, (candidate) =>
    existingNames.has(`${candidate}${extension}`)
  );
  const destinationFileName = `${uniqueBaseName}${extension}`;
  const destinationAbsolutePath = `${assetsDir}/${destinationFileName}`;

  await fileSystem.copyFile(sourceAbsolutePath, destinationAbsolutePath);

  return `${ASSETS_DIRECTORY_NAME}/${destinationFileName}`;
}
