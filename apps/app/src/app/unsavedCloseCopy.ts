/** What the user was doing when Clutter found notes that are still unsaved. */
export type UnsavedAction = 'close' | 'switch';

/** The wording of the dialog shown when closing Clutter or leaving a Space while notes still have unsaved changes. */
export function unsavedCloseCopy(unsavedCount: number, action: UnsavedAction = 'close') {
  const subject = unsavedCount === 1 ? 'One note has changes' : `${unsavedCount} notes have changes`;
  const leaving = action === 'switch' ? 'switch spaces' : 'close';

  return {
    title: action === 'switch' ? 'Switch spaces without saving?' : 'Close without saving?',
    description: `${subject} that haven’t been saved. If you ${leaving} now, they’ll be lost`,
    confirmLabel: action === 'switch' ? 'Switch and lose changes' : 'Close and lose changes',
    cancelLabel: 'Keep editing',
  };
}
