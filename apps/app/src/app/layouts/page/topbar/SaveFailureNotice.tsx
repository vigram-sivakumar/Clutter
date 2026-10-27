import type { SaveFailureStatus } from '@core/application/page/PageOperations';
import './SaveFailureNotice.css';

const STATUS_TEXT: Record<SaveFailureStatus, string> = {
  retrying: 'Couldn’t save changes. Trying again…',
  'retry-scheduled': 'Couldn’t save changes. Will try again',
  'needs-action': 'Couldn’t save changes. Not trying again',
};

interface SaveFailureNoticeProps {
  readonly status: SaveFailureStatus;
  /** Retries the save now, through the normal save path. */
  readonly onRetry: () => void;
}

/**
 * The persistent "this note has unsaved changes" signal, shown in the top bar for as long as the open note's last save
 * failed and the changes are still only in memory. It is not a toast: a toast disappears, the unsaved changes do not.
 * It says what is true: whether Clutter is retrying now, will retry on its own, or has stopped and needs the user.
 * Retry is guarded while a retry is already running, so it cannot start an overlapping save. It clears itself when a
 * save is confirmed.
 */
export function SaveFailureNotice({ status, onRetry }: SaveFailureNoticeProps) {
  return (
    <span className="save-failure-notice" role="status" data-testid="save-failure-notice" data-status={status}>
      {STATUS_TEXT[status]}
      <button type="button" className="save-failure-notice__retry" disabled={status === 'retrying'} onClick={onRetry}>
        Retry
      </button>
    </span>
  );
}

interface SaveFailureElsewhereNoticeProps {
  /** What to call the notes that failed: a note's title, or "2 other notes". */
  readonly label: string;
  readonly onOpen: () => void;
}

/** Shown when the open note is fine but another note's save failed, so the user can find and return to it. */
export function SaveFailureElsewhereNotice({ label, onOpen }: SaveFailureElsewhereNoticeProps) {
  return (
    <span className="save-failure-notice" role="status" data-testid="save-failure-elsewhere-notice">
      Couldn’t save changes in {label}
      <button type="button" className="save-failure-notice__retry" onClick={onOpen}>
        Open
      </button>
    </span>
  );
}

interface RecoveryNoticeProps {
  readonly count: number;
  readonly onReview: () => void;
}

/** Shown while unsaved work from an earlier session is waiting for the user's decision. */
export function RecoveryNotice({ count, onReview }: RecoveryNoticeProps) {
  return (
    <span className="save-failure-notice recovery-notice" role="status" data-testid="recovery-notice">
      {count === 1 ? '1 note has' : `${count} notes have`} unsaved changes from last time
      <button type="button" className="save-failure-notice__retry" onClick={onReview}>
        Review
      </button>
    </span>
  );
}
