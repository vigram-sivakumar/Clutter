import type { Page } from './Page';

/**
 * The filesystem's own dates for a page's file (ADR-057): birth time and
 * modification time as ISO-8601 UTC, `null` where the platform cannot report
 * one. A fact about the current file, read by Ingest/Sync/the Gate — never
 * Page Properties, and never serialized into frontmatter.
 */
export interface PageFileTimes {
  readonly createdAt: string | null;
  readonly modifiedAt: string | null;
}

export interface EffectivePageDates {
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}

/** `text` as ISO-8601 UTC when it is a real instant, else `null`. */
function normalized(text: string | null | undefined): string | null {
  if (text === null || text === undefined) {
    return null;
  }

  const epoch = Date.parse(text);

  return Number.isFinite(epoch) ? new Date(epoch).toISOString() : null;
}

/**
 * The one place Created / Last edited are resolved (ADR-057): exclusively the
 * file's birth / modification time, `null` when the filesystem gave none or an
 * invalid one — never a frontmatter date, never a fabricated one. Results are
 * ISO-8601 UTC, so they sort lexicographically. Pure; reads only what the page
 * already carries.
 */
export function resolveEffectivePageDates(page: Pick<Page, 'fileTimes'>): EffectivePageDates {
  return {
    createdAt: normalized(page.fileTimes?.createdAt),
    updatedAt: normalized(page.fileTimes?.modifiedAt),
  };
}
