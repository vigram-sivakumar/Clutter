import type { VaultFileSystem } from '../providers/VaultFileSystem';

export const ASSETS_DIRECTORY_NAME = 'Assets';

/**
 * Lazily creates `{vaultRoot}/Assets/` before the first cover-image import.
 * User-owned vault content — not Clutter system data (unlike `.clutter`).
 */
export async function ensureAssetsDirectory(
  fileSystem: VaultFileSystem,
  vaultRoot: string
): Promise<void> {
  const path = `${vaultRoot}/${ASSETS_DIRECTORY_NAME}`;

  if (await fileSystem.exists(path)) {
    return;
  }

  await fileSystem.createDirectory(path);
}
