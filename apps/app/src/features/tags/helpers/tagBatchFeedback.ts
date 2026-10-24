import type { TagBatchResult } from '@core/application/tags/TagOperations';
import type { ToastApi } from '@components/toast/ToastProvider';

export type TagBatchKind = 'delete' | 'restyle';

/**
 * The user-facing message for a tag batch that did not finish every note, or `null` when it did. A batch
 * that updated some notes and not others says how many were left — a partial result is never reported as
 * a total failure. (A deleted tag keeps its definition until every note is done, so a partial delete means
 * the tag is still there.)
 */
export function tagBatchFailureMessage(result: TagBatchResult, kind: TagBatchKind): string | null {
  if (result.complete) {
    return null;
  }

  const unfinished = result.failed.length + result.skipped.length;

  if (result.updatedPageIds.length === 0) {
    return kind === 'delete' ? 'Couldn’t delete the tag' : 'Couldn’t restyle the tags';
  }

  return kind === 'delete'
    ? `Couldn’t remove the tag from ${unfinished} of ${result.attemptedPageCount} notes`
    : `Couldn’t restyle ${unfinished} of ${result.attemptedPageCount} notes`;
}

/** Shows the message for an unfinished batch (and keeps the per-note detail in the console); silent when complete. */
export function reportTagBatch(toast: ToastApi, result: TagBatchResult, kind: TagBatchKind): void {
  const message = tagBatchFailureMessage(result, kind);

  if (message) {
    toast.fail(message, { failed: result.failed, skipped: result.skipped });
  }
}
