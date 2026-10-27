/** The wording of the dialog shown when Clutter is asked to close while notes still have unsaved changes. */
export function unsavedCloseCopy(unsavedCount: number) {
  const subject = unsavedCount === 1 ? 'One note has changes' : `${unsavedCount} notes have changes`;

  return {
    title: 'Close without saving?',
    description: `${subject} that haven’t been saved. If you close now, they’ll be lost`,
    confirmLabel: 'Close and lose changes',
    cancelLabel: 'Keep editing',
  };
}
