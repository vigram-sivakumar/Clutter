/**
 * A single pending "land on this task" request, set by Tasks sidebar's
 * "Open in note" and consumed once by PageHost — lifted to AppLayout (the
 * confirmed common ancestor of both), the same shape AppLayout's own
 * `resourceOverlay`/`tasksViewConfig` state already uses for cross-sibling
 * UI coordination.
 *
 * `from`/`to` are the task's `startOffset`/`endOffset` (its exact
 * character range in `pageId`'s current source Markdown) at the moment
 * "Open in note" was clicked — the positional identity that lets the
 * second of two textually-identical task lines be targeted correctly,
 * instead of a `rawText` search that can't distinguish them.
 */
export interface PendingTaskReveal {
  readonly pageId: string;
  readonly from: number;
  readonly to: number;
}
