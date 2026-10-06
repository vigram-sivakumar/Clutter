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
  sourceAbsolutePath: string,
  /** The absolute folder the file goes into — a folder inside `Assets/`. Absent: `Assets/` itself. */
  destinationFolderPath?: string
): Promise<string> {
  const { destinationAbsolutePath, reference } = await resolveAssetDestination(
    fileSystem,
    vaultRoot,
    VaultPath.filename(sourceAbsolutePath),
    destinationFolderPath
  );

  await fileSystem.copyFile(sourceAbsolutePath, destinationAbsolutePath);

  return reference;
}

/**
 * Where a new asset called `fileName` goes in `{vaultRoot}/Assets/`: the
 * folder is created if needed, and the name is made collision-free (`photo`,
 * `photo 2`, …). The one place an imported asset's destination is decided —
 * shared by importing a file (`importAsset`) and saving remote bytes
 * (`importRemoteAsset`), so the two can never name things differently.
 */
export async function resolveAssetDestination(
  fileSystem: VaultFileSystem,
  vaultRoot: string,
  fileName: string,
  /** The absolute folder the file goes into — `Assets/` itself, or a folder inside it. Absent: `Assets/`. */
  destinationFolderPath?: string
): Promise<{ readonly destinationAbsolutePath: string; readonly reference: string }> {
  await ensureAssetsDirectory(fileSystem, vaultRoot);

  const assetsDir = destinationFolderPath ?? `${vaultRoot}/${ASSETS_DIRECTORY_NAME}`;
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : '';

  const entries = await fileSystem.readDirectory(assetsDir);
  // Compared ignoring case: the common file systems (macOS, Windows) would put
  // `Photo.jpg` and `photo.jpg` in the same file.
  const existingNames = new Set(
    entries.filter((entry) => !entry.isDirectory).map((entry) => entry.name.toLowerCase())
  );

  const uniqueBaseName = resolveCollisionFreeName(baseName, (candidate) =>
    existingNames.has(`${candidate}${extension}`.toLowerCase())
  );
  const destinationFileName = `${uniqueBaseName}${extension}`;

  return {
    destinationAbsolutePath: `${assetsDir}/${destinationFileName}`,
    // Vault-relative: `Assets/photo.png`, or `Assets/Trips/photo.png` for a folder inside it.
    reference: `${assetsDir.slice(vaultRoot.length + 1)}/${destinationFileName}`,
  };
}
