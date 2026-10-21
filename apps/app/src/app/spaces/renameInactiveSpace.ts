import { isValidSpaceFolderName } from '@core/vault/ingest/spaceFolderName';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import type { SpaceFolderStatus } from '@core/vault/providers/probeSpaceFolder';
import type { RenameRefusal } from './renameActiveSpace';
import type { SpaceIdReading } from './reconcilePendingRename';
import { normalizeSpacePath } from './spaceRegistry';
import type { SpaceLifecycleGuard } from './spaceLifecycleGuard';

export interface InactiveRenameDeps {
  /** The guard shared with every other Space operation: an active rename, a removal, a switch or another rename. */
  guard: SpaceLifecycleGuard;
  activePath(): string | null;
  isRegistered(path: string): boolean;
  /** Whether the Space's folder can be reached right now (a read-only look). */
  probe(path: string): Promise<SpaceFolderStatus>;
  readSpaceId(path: string): Promise<SpaceIdReading>;
  /** Advisory only, so a taken name is refused early; the Rust rename is authoritative. */
  destinationExists(path: string): Promise<boolean>;
  /** The existing Rust-backed rename: in place, never overwriting, errors mapped to user wording. */
  renameFolder(path: string, newName: string): Promise<{ path: string } | { error: string }>;
  /** Carries saved state keyed by path-derived ids over to the renamed folder (idempotent). */
  migrateState(oldRoot: string, newRoot: string): Promise<boolean>;
  /** Moves the registry entry to the new path. `false` when it could not be saved (the entry still moves in memory). */
  renameEntry(from: string, to: string): boolean;
}

export type InactiveRenameOutcome =
  /** Nothing changed. */
  | { status: 'refused'; reason: RenameRefusal }
  /** The folder has its new name and the registry points to it. */
  | { status: 'renamed'; path: string; warnings: readonly ('state-not-migrated' | 'registry-not-saved')[] }
  /** The folder rename was refused by the OS (a name appeared, permission…): the folder and the registry are as they were. */
  | { status: 'failed'; message: string }
  /** The folder is renamed but could not be confirmed at its new path: nothing in the registry changed, nothing is undone. */
  | { status: 'unconfirmed'; message: string };

/**
 * Renames the folder of a Space that is NOT open. Nothing about the open Space is touched: no quiescence, no close, no
 * reopen, no recovery flow — the folder is not in use by any Application, so it is simply renamed, and the registry
 * entry follows. The same guard as every other Space operation is held throughout, so it cannot race with an active
 * rename, a removal, a switch or a second inactive rename.
 *
 *   validate → name not taken (advisory) → folder reachable → remember its Space id → rename (Rust, authoritative) →
 *   confirm the id at the new path → carry saved state over → move the registry entry.
 *
 * If the rename fails the registry is left pointing at the original path. If it succeeds but the Space cannot be seen
 * at its new path, the registry is not moved and nothing is renamed back: the outcome is ambiguous, so it is reported.
 */
export async function renameInactiveSpaceFolder(
  deps: InactiveRenameDeps,
  path: string,
  newName: string
): Promise<InactiveRenameOutcome> {
  const release = deps.guard.begin('renaming');
  if (release === null) return { status: 'refused', reason: 'busy' };
  const refused = (reason: RenameRefusal): InactiveRenameOutcome => ({ status: 'refused', reason });

  try {
    const from = normalizeSpacePath(path);
    if (!deps.isRegistered(from)) return refused('no-space');
    if (from === deps.activePath()) return refused('not-inactive');
    if (!isValidSpaceFolderName(newName)) return refused('invalid-name');

    const to = normalizeSpacePath(`${VaultPath.parentDirectory(from)}/${newName.trim()}`);
    if (to === from) return refused('unchanged');
    // A case-only change names the same folder on a case-insensitive volume: left to the Rust rename.
    if (to.toLowerCase() !== from.toLowerCase() && (await deps.destinationExists(to))) return refused('name-taken');
    if ((await deps.probe(from)) !== 'available') return refused('unavailable');

    const before = await deps.readSpaceId(from);
    if (before === 'unreadable') return refused('unavailable');

    const renamed = await deps.renameFolder(from, newName);
    if ('error' in renamed) return { status: 'failed', message: renamed.error };

    const newPath = normalizeSpacePath(renamed.path);
    // The Space must be seen to be at its new path, with the id it had (a Space with no profile has none to compare).
    if ((await deps.readSpaceId(newPath)) !== before) {
      return {
        status: 'unconfirmed',
        message: 'The folder was renamed, but Clutter couldn’t confirm it is still this space',
      };
    }

    const warnings: ('state-not-migrated' | 'registry-not-saved')[] = [];
    if (!(await deps.migrateState(from, newPath))) warnings.push('state-not-migrated');
    if (!deps.renameEntry(from, newPath)) warnings.push('registry-not-saved');

    return { status: 'renamed', path: newPath, warnings };
  } catch (error) {
    console.error('Renaming the space failed unexpectedly:', error);

    return { status: 'failed', message: 'Something went wrong while renaming the space' };
  } finally {
    release();
  }
}
