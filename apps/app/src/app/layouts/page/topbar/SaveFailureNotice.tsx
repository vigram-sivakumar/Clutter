import type { SaveFailureKind, SaveFailureStatus } from '@core/application/page/PageOperations';
import './SaveFailureNotice.css';
import { Button } from '../../../../components/button/Button';

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
}

/**
 * The persistent "this note has unsaved changes" signal, shown in the top bar for as long as the open note's last save
 * failed and the changes are still only in memory. It is not a toast: a toast disappears, the unsaved changes do not.
 * It always says the same thing: the changes are not saved, and Retry is there. Whether Clutter is waiting, retrying or
 * has used up its automatic retries is internal (`status` only drives the button and `data-status`). Retry is disabled
 * while a retry is already running, so it cannot start an overlapping save. It clears itself when a
 * save is confirmed.
 */
export function SaveFailureNotice({ status, kind = 'failed', onRetry, onSaveAsNewNote }: SaveFailureNoticeProps) {
  // What the user is told, and the one safe thing they can do about it, depends on why the save failed (ADR-063).
  // Retry means "write again", so it is withheld wherever writing again would be wrong or pointless.
  const message = {
    failed: 'Couldn’t save changes',
    'changed-on-disk': 'This note changed on disk',
    unverified: 'Couldn’t verify the save',
    'unsupported-location': 'Can’t save safely to this location',
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
        <Button size="small" variant="outline-danger" isLink onClick={onSaveAsNewNote}>
          Save as new note
        </Button>
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
