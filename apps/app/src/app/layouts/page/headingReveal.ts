import { extractHeadingOccurrences, findFirstHeadingOccurrence } from '@core/vault/ingest/extractors/headingSemantics';

import type { PendingEditorReveal } from './PendingEditorReveal';

/**
 * The editor range to reveal for the heading `heading` in `markdown`: the heading's own line — the same
 * "land on this content" range shape every navigation source (Tasks, Tags) already hands the editor. Matched
 * by the shared heading rules (exact text after trimming, first match in document order), so it lands on the
 * heading a reference resolves to. `null` when there is no such heading.
 */
export function findHeadingRevealRange(markdown: string, heading: string): { from: number; to: number } | null {
  const occurrence = findFirstHeadingOccurrence(extractHeadingOccurrences(markdown), heading.trim());

  if (!occurrence) {
    return null;
  }

  const lineEnd = markdown.indexOf('\n', occurrence.from);

  return { from: occurrence.from, to: lineEnd === -1 ? markdown.length : lineEnd };
}

export interface HeadingNavigationDeps {
  /** The one page navigation (`PageOperations.open`). */
  readonly open: (pageId: string) => void;
  /** The page's current Markdown — what the editor will show (an open session's text wins over the saved copy). */
  readonly getMarkdown: (pageId: string) => string;
  /** The one reveal request (`AppLayout`'s `pendingReveal`): open → scroll → highlight, consumed by the target's editor. */
  readonly requestReveal: (reveal: PendingEditorReveal) => void;
}

/**
 * Opens `pageId` and, when `heading` names a heading in it, asks the editor to scroll to and highlight that
 * heading — through the existing navigation and reveal pipeline, not a mechanism of its own. A block reference
 * (`^id`), a missing heading, or no heading at all just opens the page. Shared by wiki links and embeds.
 */
export function openPageAtHeading(
  deps: HeadingNavigationDeps,
  pageId: string,
  heading?: string | null
): void {
  deps.open(pageId);

  if (!heading || heading.trim().startsWith('^')) {
    return;
  }

  const range = findHeadingRevealRange(deps.getMarkdown(pageId), heading);

  if (range) {
    deps.requestReveal({ pageId, ranges: [range] });
  }
}
