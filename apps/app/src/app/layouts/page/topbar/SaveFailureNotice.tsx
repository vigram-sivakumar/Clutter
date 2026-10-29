import type { SaveFailureKind, SaveFailureStatus } from '@core/application/page/PageOperations';
import './SaveFailureNotice.css';
import { Button } from '../../../../components/button/Button';
import { UNSUPPORTED_LOCATION_MESSAGE } from '@app/saveFailureMessages';

interface SaveFailureNoticeProps {
  readonly status: SaveFailureStatus;
  /** Why it failed (default `failed`: nothing was written, trying again can help). */
  readonly kind?: SaveFailureKind;
  /** Retries the save now, through the normal save path. */
  readonly onRetry: () => void;
  /**
   * For a note that changed on disk: keeps the unsaved text as a new note. Retry is not offered for that case, because
   * a repeat would overwrite what is on disk now.
   */
  readonly onSaveAsNewNote?: () => void;
  /** A copy is being made right now: Save as new note cannot be started again until it ends. */
  readonly copyPending?: boolean;
  /**
   * Why the last Save as new note failed, shown with the notice for as long as the note is still unsaved. The note's
   * own failure stays exactly as it was: a failed copy changes nothing about the note, so the notice does not go, and
   * a transient toast is not the only place the user is told.
   */
  readonly copyFailure?: string | null;
}

/**
 * The persistent "this note has unsaved changes" signal, shown in the top bar for as long as the open note's last save
 * failed and the changes are still only in memory. It is not a toast: a toast disappears, the unsaved changes do not.
 * It always says the same thing: the changes are not saved, and Retry is there. Whether Clutter is waiting, retrying or
 * has used up its automatic retries is internal (`status` only drives the button and `data-status`). Retry is disabled
 * while a retry is already running, so it cannot start an overlapping save. It clears itself when a
 * save is confirmed.
 */
export function SaveFailureNotice({ status, kind = 'failed', onRetry, onSaveAsNewNote, copyPending = false, copyFailure = null }: SaveFailureNoticeProps) {
  // What the user is told, and the one safe thing they can do about it, depends on why the save failed (ADR-063).
  // Retry means "write again", so it is withheld wherever writing again would be wrong or pointless.
  const message = {
    failed: 'Couldn’t save changes',
    'changed-on-disk': 'This note changed on disk',
    unverified: 'Couldn’t verify the save',
    'unsupported-location': UNSUPPORTED_LOCATION_MESSAGE,
  }[kind];
  const canRetry = kind === 'failed' || kind === 'unverified';
  const canSaveAsNewNote = kind === 'changed-on-disk' && onSaveAsNewNote !== undefined;

  return (
    <span
      className="save-failure-notice"
      role="status"
      data-testid="save-failure-notice"
      data-status={status}
      data-kind={kind}
    >
      {message}
      {canRetry && (
        <Button
          size="small"
          variant="outline-danger"
          isLink
          disabled={status === 'retrying'}
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
      {canSaveAsNewNote && (
        <Button size="small" variant="outline-danger" isLink disabled={copyPending} onClick={onSaveAsNewNote}>
          Save as new note
        </Button>
      )}
      {canSaveAsNewNote && copyFailure !== null && (
        <span className="save-failure-notice__detail" data-testid="save-failure-copy-error">
          {copyFailure}
        </span>
      )}
    </span>
  );
}

interface RecoveryNoticeProps {
  readonly onReview: () => void;
}

/** Shown in the top bar of the open note while unsaved work from an earlier session for that note awaits a decision. */
export function RecoveryNotice({ onReview }: RecoveryNoticeProps) {
  return (
    <span
      className="save-failure-notice recovery-notice"
      role="status"
      data-testid="recovery-notice"
    >
      This note has unsaved changes from last time
      <Button size="small" variant="outline" isLink onClick={onReview}>
        Review
      </Button>
    </span>
  );
}
