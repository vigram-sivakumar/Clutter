import { ASSETS_DIRECTORY_NAME } from '../initialize/ensureAssetsDirectory';
import type { VaultFileSystem } from '../providers/VaultFileSystem';

/**
 * One entry in `{vaultRoot}/Assets/` — `reference` is the same
 * vault-relative shape `importAsset` returns (`Assets/<name>`), so a
 * caller never needs a second way to turn a listed asset into something
 * insertable.
 */
export interface AssetEntry {
  readonly reference: string;
  readonly name: string;
}

/**
 * Lists the immediate contents of `{vaultRoot}/Assets/` — deliberately
 * not recursive. `Assets/` is a single, flat directory by construction
 * (`ensureAssetsDirectory`/`importAsset` never create subdirectories
 * under it), so "search the whole vault" is already satisfied by a
 * single-level listing; there is no per-page or nested asset location to
 * walk into. Subdirectories that end up there some other way are excluded
 * from the result, not walked into.
 *
 * Returns an empty list rather than throwing when `Assets/` doesn't exist
 * yet (a real, expected state before the first asset is ever imported) —
 * `VaultFileSystem.readDirectory` is not guaranteed to tolerate a missing
 * path the way the in-memory test double does, so this checks first
 * rather than relying on that.
 */
export async function listAssets(
  fileSystem: VaultFileSystem,
  vaultRoot: string
): Promise<readonly AssetEntry[]> {
  const assetsDir = `${vaultRoot}/${ASSETS_DIRECTORY_NAME}`;

  if (!(await fileSystem.exists(assetsDir))) {
    return [];
  }

  const entries = await fileSystem.readDirectory(assetsDir);

  return entries
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({
      reference: `${ASSETS_DIRECTORY_NAME}/${entry.name}`,
      name: entry.name,
    }));
}
