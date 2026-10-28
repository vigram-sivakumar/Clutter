/** What the user was doing when Clutter found notes that are still unsaved. */
export type UnsavedAction = 'close' | 'switch';

/**
 * The wording of the dialog shown when closing Clutter or leaving a Space while notes still have unsaved changes.
 *
 * `recoveryKept` is true only when a recovery copy of the unsaved work has just been confirmed on disk. Leaving a Space
 * then does not lose the work (the copy is kept and offered when the Space is opened again), so the dialog says that
 * instead of saying the changes will be lost.
 */
export function unsavedCloseCopy(unsavedCount: number, action: UnsavedAction = 'close', recoveryKept = false) {
  const subject = unsavedCount === 1 ? 'One note has changes' : `${unsavedCount} notes have changes`;

  if (action === 'switch' && recoveryKept) {
    const them = unsavedCount === 1 ? 'it' : 'them';

    return {
      title: 'Switch spaces?',
      description: `${subject} that haven’t been saved to this space. Clutter keeps a recovery copy of ${them}, so you can restore ${them} when you come back`,
      confirmLabel: 'Switch anyway',
      cancelLabel: 'Keep editing',
    };
  }

  const leaving = action === 'switch' ? 'switch spaces' : 'close';

  return {
    title: action === 'switch' ? 'Switch spaces without saving?' : 'Close without saving?',
    description: `${subject} that haven’t been saved. If you ${leaving} now, they’ll be lost`,
    confirmLabel: action === 'switch' ? 'Switch and lose changes' : 'Close and lose changes',
    cancelLabel: 'Keep editing',
  };
}
