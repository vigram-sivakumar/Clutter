import type { SpaceRegistryStorage } from './spaceRegistry';

/**
 * ADR-067's application-level first-run record: whether the welcome content has been decided for this install of
 * Clutter. It sits beside the Space registry (same storage, ADR-056) and not inside any Space, because the registry
 * empties again whenever a user removes all their Spaces, and during lost-Space recovery, so an empty registry can
 * never stand for "first run". Any record, in any state, means the first-run decision is made and a fresh install
 * never starts again.
 */
export const WELCOME_CONTENT_STORAGE_KEY = 'clutter.welcomeContent';

export type WelcomeContentState =
  /** Written before any content is written. */
  | 'started'
  | 'done'
  /** The first Space was an existing folder the user chose. Nothing was installed, and never will be. */
  | 'skipped-existing-folder'
  /** A Space was already open when this record first existed (an upgrade, or a recovery). */
  | 'skipped-existing-user';

/** `null`: no record. `'unavailable'`: storage cannot be read, which is treated as "decided" (no install). */
export function readWelcomeContentRecord(storage: SpaceRegistryStorage | null): WelcomeContentState | null | 'unavailable' {
  if (storage === null) return 'unavailable';

  try {
    const raw = storage.getItem(WELCOME_CONTENT_STORAGE_KEY);
    if (raw === null || raw === '') return null;

    const parsed: unknown = JSON.parse(raw);
    const state = (parsed as { state?: unknown } | null)?.state;

    return state === 'started' || state === 'done' || state === 'skipped-existing-folder' || state === 'skipped-existing-user'
      ? state
      : 'done';
  } catch {
    // A record that exists but cannot be read is still a record: never a reason to install.
    return 'done';
  }
}

/** Whether the record was actually written. A refused write is reported, never ignored. */
export function writeWelcomeContentRecord(storage: SpaceRegistryStorage | null, state: WelcomeContentState): boolean {
  try {
    if (!storage) return false;
    storage.setItem(WELCOME_CONTENT_STORAGE_KEY, JSON.stringify({ version: 1, state }));

    return true;
  } catch {
    return false;
  }
}

export type WelcomeContentDecision = 'install' | 'skip-existing-folder' | 'skip-existing-user' | 'decided';

/**
 * What a Space that has just opened means for the welcome content.
 *
 * - `install`: only when there is no record AND Clutter created this Space itself through the Welcome dialog's Create.
 * - `skip-existing-folder`: no record, and the user chose the Space in the Welcome dialog (an existing folder).
 * - `skip-existing-user`: no record, and the Space opened any other way (startup restore, recovery, switching).
 * - `decided`: a record exists (or storage is unavailable). Nothing to decide, except that a `started` record retried
 *   for the folder Clutter created for it asks for the install again.
 */
export function decideWelcomeContent(input: {
  readonly record: WelcomeContentState | null | 'unavailable';
  readonly fromWelcome: boolean;
  readonly createdByWelcome: boolean;
}): WelcomeContentDecision {
  // A first run that was started and not finished, retried for the folder Clutter created for it: the install is asked
  // for again, and refuses by itself (a non-empty Space, or a ledger) unless nothing was ever written.
  if (input.record === 'started' && input.fromWelcome && input.createdByWelcome) return 'install';
  if (input.record !== null) return 'decided';
  if (input.fromWelcome && input.createdByWelcome) return 'install';

  return input.fromWelcome ? 'skip-existing-folder' : 'skip-existing-user';
}
