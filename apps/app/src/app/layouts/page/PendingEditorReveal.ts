/**
 * A single pending "land on this content" request — the generalized form
 * of what was originally Tasks sidebar's own "Show in note" request
 * (`PendingTaskReveal`, since folded into this). Set by any navigation
 * source that wants to open a note and immediately scroll to/highlight
 * specific content in it — Tasks sidebar's "Show in note" (today, always
 * one range) and Tag collection's "Open note" (today, one range per
 * occurrence of the clicked tag in that note) — lifted to AppLayout (the
 * confirmed common ancestor of Sidebar and PageHost, the same shape
 * AppLayout's own `resourceOverlay`/`tasksViewConfig` state already uses
 * for cross-sibling UI coordination), consumed once by PageHost via
 * `MarkdownEditor`'s own `pendingReveal` prop.
 *
 * `ranges` are each occurrence's exact `startOffset`/`endOffset` (its
 * character range in `pageId`'s current source Markdown) at the moment the
 * request was made — the positional identity that lets a textually-
 * identical occurrence be targeted correctly, instead of a `rawText`
 * search that can't distinguish them, same as `PendingTaskReveal`'s
 * original single-range version already established. `MarkdownEditor`
 * resolves every range to its own containing editor line and highlights
 * all of them at once (`editorRevealHighlight.ts`) — this type itself
 * stays source-position-only, never pre-resolved to lines, so it has no
 * dependency on CodeMirror or any editor-internal concept.
 *
 * Any future navigation source (search, backlinks, mentions) that wants
 * this same "open note → scroll → highlight" behavior is meant to reuse
 * this exact type and the same `onRequestReveal` callback, not introduce
 * a parallel one.
 */
export interface PendingEditorReveal {
  readonly pageId: string;
  readonly ranges: readonly { readonly from: number; readonly to: number }[];
}
