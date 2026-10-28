/** What the user was doing when Clutter found notes that are still unsaved. */
export type UnsavedAction = 'close' | 'switch';

/**
 * The wording of the dialog shown when closing Clutter or leaving a Space while notes still have unsaved changes.
 *
 * One wording for every case: the title ("Switch spaces?" / "Close without saving?"), how many notes, and the one
 * danger action ("Switch anyway", "Close anyway").
 */
export function unsavedCloseCopy(unsavedCount: number, action: UnsavedAction = 'close') {
  return {
    title: action === 'switch' ? 'Switch spaces?' : 'Close without saving?',
    description: unsavedCount === 1 ? 'You have unsaved changes' : `You have ${unsavedCount} notes with unsaved changes`,
    confirmLabel: action === 'switch' ? 'Switch anyway' : 'Close anyway',
    cancelLabel: 'Keep editing',
  };
}
