import type { SpaceFolderStatus } from '@core/vault/providers/probeSpaceFolder';
import type { SpaceAvatarChange } from '@core/application/space/SpaceProfileStore';
import { describeSpaceProfileFailure } from '../saveFailureMessages';
import { normalizeSpacePath } from './spaceRegistry';
import type { SpaceLifecycleGuard } from './spaceLifecycleGuard';

export interface InactiveAvatarDeps {
  /** The guard shared with every other Space operation: while it is held the Space cannot be opened, renamed or removed. */
  guard: SpaceLifecycleGuard;
  activePath(): string | null;
  isRegistered(path: string): boolean;
  /** Whether the Space's folder can be reached right now (a read-only look): a missing folder is never written into. */
  probe(path: string): Promise<SpaceFolderStatus>;
  /** Writes the avatar into that Space's own profile (`setSpaceProfileAvatar` on a file system rooted at it). */
  applyAvatar(path: string, change: SpaceAvatarChange): Promise<unknown>;
}

export type InactiveAvatarRefusal = 'busy' | 'no-space' | 'not-inactive' | 'unavailable';

export type InactiveAvatarOutcome =
  /** Nothing changed. */
  | { status: 'refused'; reason: InactiveAvatarRefusal }
  /** The avatar is in the Space's profile on disk. */
  | { status: 'changed' }
  /** The write did not happen: the profile on disk is as it was. `message` is safe to show. */
  | { status: 'failed'; message: string };

/** What to tell the user when nothing was changed. Sentence case, no ending period (docs/writing-principles.md). */
export function describeInactiveAvatarRefusal(reason: InactiveAvatarRefusal): string {
  switch (reason) {
    case 'busy':
      return 'Another space operation is in progress. Try again in a moment';
    case 'unavailable':
      return 'Clutter can’t reach this space’s folder, so its avatar can’t be changed right now';
    case 'no-space':
    case 'not-inactive':
      return 'The avatar was not changed';
  }
}

/**
 * Changes the avatar of a Space that is NOT open (ADR-064). The open Space is never involved — its avatar goes through
 * its own Application — and the guard is held for the whole change, so the Space cannot be opened, renamed or removed
 * between checking it and writing it (an Application that loaded its profile first would otherwise write over this).
 *
 *   guard → registered, not the open one → folder reachable → write that Space's profile and, for an image, its Assets.
 *
 * Resolves `changed` only after the write succeeded; every other outcome leaves the profile as it was.
 */
export async function changeInactiveSpaceAvatar(
  deps: InactiveAvatarDeps,
  path: string,
  change: SpaceAvatarChange
): Promise<InactiveAvatarOutcome> {
  const release = deps.guard.begin('editing-profile');
  if (release === null) return { status: 'refused', reason: 'busy' };

  try {
    const target = normalizeSpacePath(path);
    if (!deps.isRegistered(target)) return { status: 'refused', reason: 'no-space' };
    if (target === deps.activePath()) return { status: 'refused', reason: 'not-inactive' };
    if ((await deps.probe(target)) !== 'available') return { status: 'refused', reason: 'unavailable' };

    await deps.applyAvatar(target, change);
    return { status: 'changed' };
  } catch (error) {
    console.error('Changing a space avatar failed:', error);
    return { status: 'failed', message: describeSpaceProfileFailure(error).text };
  } finally {
    release();
  }
}
