/**
 * The two settings that used to be app-wide and are now saved per Space (in its `.clutter/workspace.json`): the
 * default cover position and "Automatically delete archived items". Their old `localStorage` keys are read here
 * only so the migration can carry the values over; nothing else reads or writes them any more.
 *
 * Migration policy (see `migrateLegacyAppSettings`):
 * - Default cover position: a Space that never chose its own is seeded, once, from the old value — so a user who
 *   had Top everywhere still has Top in each existing Space. A Space that already has its own value is never
 *   overwritten. The old key is kept: it cannot be removed while any Space might still need to be seeded from it,
 *   and nothing but this migration reads it.
 * - Automatically delete archived items: never carried over. It deletes data, so turning it on in a Space the user
 *   did not enable it for would be a change they never asked for; every Space starts with it off, and the old
 *   value is discarded.
 */
export const LEGACY_COVER_POSITION_KEY = 'clutter-default-cover-position';
export const LEGACY_AUTO_DELETE_ARCHIVED_KEY = 'clutter-auto-delete-archived';

/** The old app-wide cover position, or undefined when there was none (the old default, Right, had no stored value). */
export function readLegacyCoverPosition(): 'above' | undefined {
  try {
    return localStorage.getItem(LEGACY_COVER_POSITION_KEY) === 'above' ? 'above' : undefined;
  } catch {
    return undefined;
  }
}

/** Removes the old app-wide automatic-cleanup value, once it has been deliberately not migrated. */
export function discardLegacyAutoDeleteArchived(): void {
  try {
    localStorage.removeItem(LEGACY_AUTO_DELETE_ARCHIVED_KEY);
  } catch {
    // Nothing to do: an unwritable store cannot hold the value either.
  }
}

/**
 * Removes both old app-wide values. "Reset settings to defaults" calls it, because a Space that no longer has a cover
 * position of its own would otherwise be seeded from the old value again the next time it opens
 * (`migrateLegacyAppSettings`), quietly undoing the reset.
 */
export function clearLegacyAppSettings(): void {
  try {
    localStorage.removeItem(LEGACY_COVER_POSITION_KEY);
    localStorage.removeItem(LEGACY_AUTO_DELETE_ARCHIVED_KEY);
  } catch {
    // Nothing to do: an unwritable store cannot hold the values either.
  }
}
