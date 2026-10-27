import './SaveFailureNotice.css';

/**
 * The persistent "this note has unsaved changes" signal, shown in the top bar for as long as the open document's
 * last save failed (DocumentState.SaveError) and the failed revision is still held in memory. It is not a toast:
 * a toast disappears, the unsaved changes do not. It clears itself when a later save succeeds, because the session
 * leaves SaveError then. Shown only on failure; there is no "saved" counterpart, since nothing else in the page
 * chrome claims one.
 */
export function SaveFailureNotice() {
  return (
    <span className="save-failure-notice" role="status" data-testid="save-failure-notice">
      Couldn’t save changes
    </span>
  );
}
