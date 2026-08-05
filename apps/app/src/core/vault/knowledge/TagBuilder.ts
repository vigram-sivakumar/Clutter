import type { Page, Tag, TagMetadataEntry } from '../models';
import { normalizeTagName } from '../models/Tag';

interface TagAccumulator {
  // First-typed casing wins for the same normalized identity — e.g. #Project
  // in one page and #project in another still merge into one Tag, and this
  // is the only place that decision gets made.
  name: string;
  pageIds: Set<string>;
}

export class TagBuilder {
  /**
   * Markdown determines what tags exist — this loop only ever iterates
   * occurrences, never tagMetadata's keys, so a metadata-only entry with no
   * occurrence anywhere in the vault never manufactures a Tag (see
   * .clutter/tags.json's "only tags with metadata exist" / orphan-entry
   * handling). tagMetadata is enrichment consulted per normalized name,
   * once per unique tag — never a second source of tag existence.
   *
   * normalizeTagName() is used here purely as a comparison/grouping key —
   * it decides which occurrences are "the same tag," never what gets
   * stored as Tag.name. The stored name is always the exact text the user
   * typed (see TagAccumulator.name) — this is the one place in the whole
   * pipeline where identity (normalized) and display (as-typed) diverge,
   * and it stays local to this function, never promoted to a second field
   * on Tag itself.
   */
  build(
    pages: readonly Page[],
    tagMetadata: ReadonlyMap<string, TagMetadataEntry> = new Map()
  ): readonly Tag[] {
    const byNormalizedName = new Map<string, TagAccumulator>();

    for (const page of pages) {
      for (const occurrence of page.analysis.tags) {
        const key = normalizeTagName(occurrence.name);
        let accumulator = byNormalizedName.get(key);

        if (!accumulator) {
          accumulator = { name: occurrence.name, pageIds: new Set() };
          byNormalizedName.set(key, accumulator);
        }

        accumulator.pageIds.add(page.id);
      }
    }

    const tags: Tag[] = [...byNormalizedName.entries()].map(
      ([key, { name, pageIds }]) => ({
        name,
        icon: tagMetadata.get(key)?.icon,
        favorite: tagMetadata.get(key)?.favorite ?? false,
        usageCount: pageIds.size,
      })
    );

    // Alphabetical (case-insensitive) is the default ordering for every
    // consumer of vault.tags() — sorted once here, not left to each reader
    // (sidebar, future collection views, search) to remember to do
    // themselves. This comparison, like the grouping above, never touches
    // what's stored — only how the already-preserved names are ordered.
    return tags.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  }
}
