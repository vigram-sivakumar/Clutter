import { resolveCollisionFreeName } from '../shared/naming/resolveCollisionFreeName';
import { VaultPath } from './ingest/VaultPath';
import {
  ASSETS_DIRECTORY_NAME,
  ensureAssetsDirectory,
} from './initialize/ensureAssetsDirectory';
import type { VaultFileSystem } from './providers/VaultFileSystem';

/**
 * Copies an external image into `{vaultRoot}/Assets/` and returns the
 * vault-relative reference (`Assets/<filename>`) for frontmatter storage.
 * Non-Gate write — user vault files, not Page/Folder domain content.
 */
export async function importCoverAsset(
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
