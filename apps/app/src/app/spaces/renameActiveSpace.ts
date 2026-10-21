import { isValidSpaceFolderName } from '@core/vault/ingest/spaceFolderName';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import type { QuiesceResult } from '@core/application/Application';
import { normalizeSpacePath } from './spaceRegistry';
import type { SpaceIdReading } from './reconcilePendingRename';
import type { SpaceLifecycleGuard } from './spaceLifecycleGuard';

/** What the orchestration needs from the open Application. */
export interface RenamableApplication {
  /** The Space's stable id, as the open Application knows it (`null` while it has none). */
  readonly spaceId: string | null;
  quiesceForRename(): Promise<QuiesceResult>;
  close(): Promise<void>;
}

export interface RenameDeps {
  guard: SpaceLifecycleGuard;
  activePath(): string | null;
  application(): RenamableApplication | null;
  /** Forgets the open Application: the shell shows no workspace until a new one opens. Called once it has been closed. */
  detachApplication(): void;
  registry: {
    beginRename(to: string, spaceId: string | null): boolean;
    completeRename(to: string): boolean;
    abandonRename(): boolean;
    hasPendingRename(): boolean;
  };
  /** The existing Rust-backed rename: the folder, in place, never overwriting. */
  renameFolder(path: string, newName: string): Promise<{ path: string } | { error: string }>;
  readSpaceId(path: string): Promise<SpaceIdReading>;
  /**
   * Whether a folder already exists at `path` — an early, advisory check so a taken name is refused BEFORE anything is
   * closed. Never authoritative: the Rust rename claims the name exclusively and refuses an existing file or folder.
   */
  destinationExists(path: string): Promise<boolean>;
  /** Carries saved state keyed by path-derived ids over to the renamed folder; resolves whether it is consistent. */
  migrateState(oldRoot: string, newRoot: string): Promise<boolean>;
  /** Makes the shell open the registry's active Space with a fresh Application (the old path: its path did not change). */
  reopenActive(): void;
  /** The existing recovery for an active Space that can't be used: another registered Space, or Welcome. */
  recoverFromLost(lostPath: string): void;
}

export type RenameRefusal =
  | 'busy'
  | 'invalid-name'
  | 'name-taken'
  | 'not-inactive'
  | 'unavailable'
  | 'unchanged'
  | 'no-space'
  | 'no-identity'
  | 'already-pending'
  | 'registry-unwritable'
  | 'unsaved'
  | 'unsupported'
  | 'cancelled';

/** What to tell the user when nothing was changed. Sentence case, no ending period (docs/writing-principles.md). */
export function describeRenameRefusal(reason: RenameRefusal): string {
  switch (reason) {
    case 'invalid-name':
      return 'Enter a name without slashes or colons';
    case 'name-taken':
      return 'A folder with that name already exists. Choose another name';
    case 'busy':
      return 'Another space operation is in progress. Try again in a moment';
    case 'no-identity':
      return 'Clutter couldn’t confirm this space’s identity, so it can’t be renamed right now';
    case 'unsaved':
      return 'Clutter couldn’t save your latest changes, so the space was not renamed';
    case 'registry-unwritable':
      return 'Clutter couldn’t record the rename, so nothing was changed';
    case 'already-pending':
      return 'A previous rename hasn’t finished yet';
    case 'unsupported':
      return 'Renaming isn’t available here';
    case 'unavailable':
      return 'Clutter can’t reach this space’s folder, so it can’t be renamed right now';
    case 'unchanged':
    case 'no-space':
    case 'not-inactive':
    case 'cancelled':
      return 'The space was not renamed';
  }
}

export type RenameOutcome =
  /** Nothing was closed or changed: the open Space is exactly as it was. */
  | { status: 'refused'; reason: RenameRefusal }
  /**
   * The folder now has its new name and the registry points to it; the shell is opening it. `warnings` lists what
   * did not go perfectly (saved state not carried over, the registry write not saved).
   */
  | { status: 'renamed'; path: string; warnings: readonly ('state-not-migrated' | 'registry-not-saved')[] }
  /** The rename was refused by the OS (name taken, permission…) and the original Space was verified and reopened. */
  | { status: 'failed'; message: string; reopened: true }
  /**
   * The Application is closed and nothing was reopened: the rename failed and the old path could not be verified
   * as the original Space, or the folder was renamed but could not be verified at its new path. The registry keeps
   * what is needed to recover (the pending record), and the existing recovery has taken over.
   */
  | { status: 'recovery'; message: string };

/**
 * Renames the open Space's folder. This owns the whole sequence from the moment the Application is sealed until a
 * fresh Application is opened or recovery has taken over — an Application that has been sealed is never used again.
 *
 *   1. Validate the name, and that the Space has a stable id that really is saved in its folder.
 *   2. Record the pending rename in the registry (written synchronously; if it can't be, nothing starts).
 *   3. Quiesce: drain, flush, verify and seal the Application. If that can't be done, clear the record and stop —
 *      the Application was never closed, so the user's editing session is untouched.
 *   4. Close the Application and rename the folder.
 *   5. Renamed: verify the Space is at the new path, carry its saved state over, then move the registry to the new
 *      path and clear the record in one write; the shell opens the new path.
 *      Not renamed: verify the old path still holds the original Space, then open a fresh Application there.
 *
 * The lifecycle guard is held throughout and released on every path. The rename itself is never undone by renaming
 * back: where something is not as expected, the registry keeps the pending record and the existing recovery runs.
 */
export async function renameActiveSpaceFolder(deps: RenameDeps, newName: string): Promise<RenameOutcome> {
  const release = deps.guard.begin('renaming');
  if (release === null) return { status: 'refused', reason: 'busy' };
  // Work that must wait until the guard is released (it starts other Space operations).
  let afterRelease: (() => void) | null = null;

  const refused = (reason: RenameRefusal): RenameOutcome => ({ status: 'refused', reason });
  let from: string | null = null;
  // Once the Application is sealed it is gone for good: an unexpected failure from then on goes to recovery.
  let sealed = false;
  let recorded = false;

  try {
    from = deps.activePath();
    const application = deps.application();
    if (from === null || application === null) return refused('no-space');
    const origin: string = from;
    if (!isValidSpaceFolderName(newName)) return refused('invalid-name');

    const to = normalizeSpacePath(`${VaultPath.parentDirectory(origin)}/${newName.trim()}`);
    if (to === origin) return refused('unchanged');
    if (deps.registry.hasPendingRename()) return refused('already-pending');
    // A name that is already taken is refused now, with the Space still open. A case-only change names the same folder
    // on a case-insensitive volume, so it is left to the Rust rename, which knows whether it is the same entry.
    if (to.toLowerCase() !== origin.toLowerCase() && (await deps.destinationExists(to))) return refused('name-taken');

    // A stable id, confirmed to be saved in the folder — not just held in memory — so it can be checked afterwards.
    const spaceId = application.spaceId;
    if (spaceId === null || (await deps.readSpaceId(origin)) !== spaceId) return refused('no-identity');

    if (!deps.registry.beginRename(to, spaceId)) return refused('registry-unwritable');
    recorded = true;

    const quiesced = await application.quiesceForRename();
    if (!quiesced.ok) {
      // Nothing was sealed or closed. The record only says "a rename was about to start": clear it.
      deps.registry.abandonRename();
      return refused(
        quiesced.reason === 'cancelled' ? 'cancelled' : quiesced.reason === 'unsupported' ? 'unsupported' : 'unsaved'
      );
    }

    // Sealed: the Application can only be closed from here. It is never returned to.
    sealed = true;
    try {
      await application.close();
    } catch (error) {
      console.error('Closing the sealed space before renaming it failed:', error);
    }
    deps.detachApplication();

    const renamed = await deps.renameFolder(from, newName);

    if ('error' in renamed) {
      // The folder is as it was (the rename refuses or rolls back by itself). Only reopen it once that is verified.
      const here = await deps.readSpaceId(from);
      if (here === spaceId) {
        deps.registry.abandonRename(); // a failed save only leaves a record that the next launch clears
        afterRelease = () => deps.reopenActive();

        return { status: 'failed', message: renamed.error, reopened: true };
      }
      afterRelease = () => deps.recoverFromLost(origin);

      return { status: 'recovery', message: renamed.error };
    }

    const newPath = normalizeSpacePath(renamed.path);
    // The folder is at its new name. Before the registry moves, the Space must be seen to be there.
    if ((await deps.readSpaceId(newPath)) !== spaceId) {
      afterRelease = () => deps.recoverFromLost(origin);

      return {
        status: 'recovery',
        message: 'The folder was renamed, but Clutter couldn’t confirm it is still this space',
      };
    }

    const warnings: ('state-not-migrated' | 'registry-not-saved')[] = [];
    if (!(await deps.migrateState(from, newPath))) warnings.push('state-not-migrated');
    // One mutation, one write: the new path becomes active and the record is cleared together. The shell then opens it.
    if (!deps.registry.completeRename(newPath)) warnings.push('registry-not-saved');

    return { status: 'renamed', path: newPath, warnings };
  } catch (error) {
    console.error('Renaming the space failed unexpectedly:', error);
    if (sealed && from !== null) {
      // The Application is already closed: hand over to the existing recovery. The record stays for next launch.
      const lost = from;
      deps.detachApplication();
      afterRelease = () => deps.recoverFromLost(lost);

      return { status: 'recovery', message: 'Something went wrong while renaming the space' };
    }
    // Never sealed: the Application is untouched. Only a record that was written needs clearing.
    if (recorded) deps.registry.abandonRename();

    return refused('unsaved');
  } finally {
    release();
    afterRelease?.();
  }
}
