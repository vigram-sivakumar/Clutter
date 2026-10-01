import { normalizeTagName } from '../models/Tag';
import type { ScannedTagOccurrence } from './extractors/TagExtractor';

/**
 * PageBuilder's one-time "Tags frontmatter has never existed for this
 * page" fallback: derives the initial `PageMetadata.tags` value from the
 * page's current inline `#tag` occurrences. Deduplicated by
 * `normalizeTagName`, first-typed casing wins — the identical identity
 * rule `TagBuilder` already applies vault-wide (see its own doc
 * comment), just scoped to one page's occurrences rather than every
 * page's, so this is a different granularity of the same rule, not a
 * duplicate of it.
 *
 * Called exactly once per page, only when frontmatter.tags is absent
 * (see PageBuilder.build()) — never on a later rebuild/reparse, which is
 * what keeps this a one-time migration rather than ongoing
 * synchronization with the body.
 */
export function deriveInitialPageTags(occurrences: readonly ScannedTagOccurrence[]): string[] {
  const byNormalizedName = new Map<string, string>();

  for (const occurrence of occurrences) {
    const key = normalizeTagName(occurrence.name);

    if (!byNormalizedName.has(key)) {
      byNormalizedName.set(key, occurrence.name);
    }
  }

  return [...byNormalizedName.values()];
}
