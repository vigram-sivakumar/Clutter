import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { RESERVED_FOLDER_IDS } from './ReservedResources';

/**
 * The `.clutter` counterpart to FolderOperations.ensureReservedFolder() —
 * same lazy lifecycle ("create immediately before the operation that
 * requires it, not eagerly at startup"), but a genuinely different
 * primitive, not a duplicate of the same one: `.clutter` is deliberately
 * excluded from every VaultScanner scan (isClutterInternalPath), so it is
 * never a `Vault.Folder` and never will be — there is no `Vault` model to
 * register it in. This is a bare filesystem check-then-create, nothing
 * else; it must never call `vault.addFolder()` or anything that would
 * make `.clutter` visible as ordinary vault content.
 *
 * Idempotent — a no-op when `.clutter` already exists. Callers that write
 * something inside `.clutter` (TagOperations.updateMetadata today; a
 * future workspace.json writer) call this immediately before their own
 * write, the same "ensure, then continue" shape every reserved Vault
 * folder now follows.
 */
export async function ensureClutterDirectory(
  fileSystem: VaultFileSystem,
  vaultRoot: string
): Promise<void> {
  const path = `${vaultRoot}/${RESERVED_FOLDER_IDS.clutter}`;

  if (await fileSystem.exists(path)) {
    return;
  }

  await fileSystem.createDirectory(path);
}
