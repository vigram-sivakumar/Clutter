import type { Page } from '@core/vault/models';
import type { SourceRange } from './getTagOccurrenceRanges';

/**
 * One distinct Markdown line in a page's body that contains at least one
 * occurrence of a given tag — the Tags sidebar's "inline context entry"
 * unit (see TagContextEntry.tsx). `ranges` carries every occurrence's
 * own `{from, to}` on that line (almost always one, but a tag repeated
 * twice on the same line collapses to a single context entry carrying
 * both ranges, mirroring the editor's own reveal mechanism's per-line
 * highlighting — never two visually-identical rows for the same line).
 */
export interface TagLineContext {
  readonly ranges: readonly SourceRange[];
  readonly lineText: string;
}

/**
 * Groups every occurrence of `tagName` in `page`'s current body by its
 * containing line, in document order (page.analysis.tags is already
 * produced in document order by TagExtractor's own line-by-line walk, so
 * grouping by first-seen line preserves it with no extra sort). Two
 * occurrences of the tag on two lines with byte-for-byte identical text
 * still produce two separate entries — each carries its own line's exact
 * offsets, never resolved by comparing `lineText`, which is exactly what
 * lets a caller reveal the correct line even when its text duplicates
 * another line elsewhere in the same note.
 */
export function getTagLineContexts(
  page: Page | undefined,
  tagName: string
): TagLineContext[] {
  if (!page) {
    return [];
  }

  const markdown = page.source.markdown;
  const occurrences = page.analysis.tags
    .filter((occurrence) => occurrence.name === tagName)
    .filter(
      (occurrence): occurrence is typeof occurrence & { startOffset: number; endOffset: number } =>
        occurrence.startOffset !== undefined && occurrence.endOffset !== undefined
    );

  const byLineStart = new Map<number, { lineText: string; ranges: SourceRange[] }>();

  for (const occurrence of occurrences) {
    const lineStart = markdown.lastIndexOf('\n', occurrence.startOffset - 1) + 1;
    const nextNewline = markdown.indexOf('\n', occurrence.endOffset);
    const lineEnd = nextNewline === -1 ? markdown.length : nextNewline;

    let entry = byLineStart.get(lineStart);
    if (!entry) {
      entry = { lineText: markdown.slice(lineStart, lineEnd), ranges: [] };
      byLineStart.set(lineStart, entry);
    }

    entry.ranges.push({ from: occurrence.startOffset, to: occurrence.endOffset });
  }

  return [...byLineStart.values()];
}
