/**
 * A rename was refused because a sibling already has that name — an expected validation outcome, not a failed write.
 * Nothing was attempted on disk, so it must never put a note or folder into its save-failure state ("Couldn’t save
 * changes"); the title and name channels recognise it and stand down quietly (`PageOperations.runRequestTitleSave`,
 * `FolderOperations.runRequestNameSave`), while the editing surface tells the user (a toast, and the field's shake).
 *
 * The message is unchanged from before this class existed: callers that only read `.message` see the same text.
 */
export class NameTakenError extends Error {
  constructor(
    message: string,
    /** The name that was refused, as the user typed it (trimmed). */
    readonly name: string
  ) {
    super(message);
    this.name = 'NameTakenError';
  }
}
