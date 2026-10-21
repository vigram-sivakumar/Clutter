import { parseSpaceProfile } from '@core/application/space/SpaceProfileStore';
import { WORKSPACE_STATE_RELATIVE_PATH } from '@core/vault/initialize/ReservedResources';
import type { VaultFileSystem } from '@core/vault/providers/VaultFileSystem';
import type { SpaceIdReading } from './reconcilePendingRename';

/**
 * The Space id saved in the folder at `path` (read-only; never writes): its id, `null` when the folder has no Space
 * profile (no state file, or one without an id), or `'unreadable'` when it could not be read. An unreadable folder is
 * never reported as "no profile": that difference decides whether a decision can be made at all.
 */
export async function readSpaceIdFrom(fileSystem: VaultFileSystem, path: string): Promise<SpaceIdReading> {
  const file = `${path}/${WORKSPACE_STATE_RELATIVE_PATH}`;
  try {
    if (!(await fileSystem.exists(file))) return null;
    return parseSpaceProfile(await fileSystem.readFile(file))?.id ?? null;
  } catch {
    return 'unreadable';
  }
}
