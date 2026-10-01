import type { Page } from '@core/vault/models';

export interface SourceRange {
  readonly from: number;
  readonly to: number;
}

/**
 * Every occurrence of `tagName` in `page`'s current analysis, as reveal
 * ranges (PendingEditorReveal's own shape) — the one implementation of
 * "which ranges does clicking this tag on this page reveal," shared by
 * Tag collection's "Open note" (PageHost's openNoteFromCollection) and the
 * Tags sidebar's expanded note rows, rather than each filtering
 * page.analysis.tags on its own.
 */
export function getTagOccurrenceRanges(
  page: Page | undefined,
  tagName: string
): SourceRange[] {
  return (page?.analysis.tags ?? [])
    .filter((occurrence) => occurrence.name === tagName)
    .filter(
      (occurrence): occurrence is typeof occurrence & { startOffset: number; endOffset: number } =>
        occurrence.startOffset !== undefined && occurrence.endOffset !== undefined
    )
    .map((occurrence) => ({ from: occurrence.startOffset, to: occurrence.endOffset }));
}
