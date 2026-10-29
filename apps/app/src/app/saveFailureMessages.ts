import { classifySaveFailure, classifyWriteRefusal } from '@core/application/page/PageOperations';

/**
 * What the user is told about a failed save, in one place, so the same cause is never explained in two different words
 * by two different surfaces (see "Choose the surface" in docs/writing-principles.md).
 */

/** This location cannot be saved to safely, and trying again will not change that (ADR-063: APFS only). */
export const UNSUPPORTED_LOCATION_MESSAGE = 'Can’t save safely to this location';

/** A Space's own settings (its identity or avatar) could not be written, for a reason that is not the location. */
export const SPACE_SETTINGS_FAILED_MESSAGE = 'Couldn’t save the space settings';

/** Whether the failure is the unsupported-location restriction. Decided by the failure's type, never by its text. */
export function isUnsupportedLocation(error: unknown): boolean {
  return classifySaveFailure(error) === 'unsupported-location';
}

/**
 * Why a copy of a note could not be made, in words that are safe to show; `null` when nothing more precise than "it
 * failed" is known. The core classifies the refusal; this only supplies the words, and an unclassified error's own text is
 * never shown.
 */
export function describeCopyFailureReason(error: unknown): string | null {
  switch (classifyWriteRefusal(error)) {
    case 'disk-full':
      return 'the disk is full';
    case 'no-permission':
      return 'Clutter can’t write to this folder';
    case 'name-taken':
      return 'a note with that name already exists';
    case 'unsupported-location':
      return 'this location can’t be saved to safely';
    case 'unavailable':
      return 'this location isn’t available for saving';
    default:
      return null;
  }
}

/** The persistent message after a failed "Save as new note". */
export function copyFailureMessage(error: unknown): string {
  const reason = describeCopyFailureReason(error);

  return reason === null ? 'Couldn’t save a copy' : `Couldn’t save a copy: ${reason}`;
}

export interface SpaceProfileFailure {
  /** What to say about it. */
  readonly text: string;
  /** The unsupported-location restriction: the explanation belongs to the note-save notice, not to a settings notice. */
  readonly unsupportedLocation: boolean;
}

/** Classifies a failed write of a Space's own profile (`.clutter/workspace.json`). */
export function describeSpaceProfileFailure(error: unknown): SpaceProfileFailure {
  return isUnsupportedLocation(error)
    ? { text: UNSUPPORTED_LOCATION_MESSAGE, unsupportedLocation: true }
    : { text: SPACE_SETTINGS_FAILED_MESSAGE, unsupportedLocation: false };
}

/**
 * Whether a failed profile write is announced to the user at once. One the user asked for (an avatar they chose) always
 * is: it did not happen. An automatic one (giving a Space that has none its identity, when it opens) is not announced
 * if the cause is the unsupported location: that is explained, once, where it matters, when the user edits a note, and
 * a "couldn’t save the space settings" in front of it would be a second, misleading account of the same thing. Any
 * other cause is an independent failure and is always announced.
 */
export function announcesProfileFailure(failure: SpaceProfileFailure, userRequested: boolean): boolean {
  return userRequested || !failure.unsupportedLocation;
}
