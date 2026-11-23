/** What the user was doing when Clutter found notes that are still unsaved. */
export type UnsavedAction = 'close' | 'switch' | 'restart';

/**
 * The wording of the dialog shown when closing Clutter or leaving a Space while notes still have unsaved changes.
 *
 * Switching Spaces: the title ("Switch spaces?"), how many notes, and the danger action "Switch anyway".
 *
 * Closing or restarting: what is true when the user chooses the destructive action. The changes are not saved to the
 * vault; Clutter writes a recovery copy as it closes, which may be offered when it opens again, but the copy is not
 * guaranteed to hold the latest keystrokes (and none is written if the recovery location cannot be written). It must
 * not promise recovery, and must not suggest the copy is already in the vault.
 */
export function unsavedCloseCopy(unsavedCount: number, action: UnsavedAction = 'close') {
  const one = unsavedCount === 1;

  if (action === 'restart') {
    const subject = one
      ? 'You have unsaved changes that won’t be saved to your vault'
      : `You have ${unsavedCount} notes with unsaved changes that won’t be saved to your vault`;
    const recovery = one
      ? 'A recovery copy may be available when Clutter opens again, but it might not include your latest edits'
      : 'Recovery copies may be available when Clutter opens again, but they might not include your latest edits';
    return {
      title: 'Restart without saving?',
      description: `${subject}. ${recovery}`,
      confirmLabel: 'Restart anyway',
      cancelLabel: 'Keep editing',
    };
  }

  if (action === 'switch') {
    return {
      title: 'Switch spaces?',
      description: one ? 'You have unsaved changes' : `You have ${unsavedCount} notes with unsaved changes`,
      confirmLabel: 'Switch anyway',
      cancelLabel: 'Keep editing',
    };
  }

  const subject = one
    ? 'You have unsaved changes that won’t be saved to your vault'
    : `You have ${unsavedCount} notes with unsaved changes that won’t be saved to your vault`;
  const recovery = one
    ? 'A recovery copy may be available when Clutter opens again, but it might not include your latest edits'
    : 'Recovery copies may be available when Clutter opens again, but they might not include your latest edits';

  return {
    title: 'Close without saving?',
    description: `${subject}. ${recovery}`,
    confirmLabel: 'Close anyway',
    cancelLabel: 'Keep editing',
  };
}
