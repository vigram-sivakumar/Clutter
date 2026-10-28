import type { SaveFailureStatus } from '@core/application/page/PageOperations';
import './SaveFailureNotice.css';
import { Button } from '../../../../components/button/Button';

interface SaveFailureNoticeProps {
  readonly status: SaveFailureStatus;
  /** Retries the save now, through the normal save path. */
  readonly onRetry: () => void;
}

/**
 * The persistent "this note has unsaved changes" signal, shown in the top bar for as long as the open note's last save
 * failed and the changes are still only in memory. It is not a toast: a toast disappears, the unsaved changes do not.
 * It always says the same thing: the changes are not saved, and Retry is there. Whether Clutter is waiting, retrying or
 * has used up its automatic retries is internal (`status` only drives the button and `data-status`). Retry is disabled
 * while a retry is already running, so it cannot start an overlapping save. It clears itself when a
 * save is confirmed.
 */
export function SaveFailureNotice({ status, onRetry }: SaveFailureNoticeProps) {
  return (
    <span
      className="save-failure-notice"
      role="status"
      data-testid="save-failure-notice"
      data-status={status}
    >
      Couldn’t save changes
      <Button size="small" variant="outline-danger" disabled={status === 'retrying'} onClick={onRetry}>
        Retry
      </Button>
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
      <Button size="small" variant="outline" onClick={onReview}>
        Review
      </Button>
    </span>
  );
}
