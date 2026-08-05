import type { Page, Tag, TagMetadataEntry } from '../models';

export class TagBuilder {
  /**
   * Markdown determines what tags exist — this loop only ever iterates
   * occurrences, never tagMetadata's keys, so a metadata-only entry with no
   * occurrence anywhere in the vault never manufactures a Tag (see
   * .clutter/tags.json's "only tags with metadata exist" / orphan-entry
   * handling). tagMetadata is enrichment consulted per name, once, exactly
   * where occurrences already dedupe by name — never a second source of
   * tag existence.
   */
  build(
    pages: readonly Page[],
    tagMetadata: ReadonlyMap<string, TagMetadataEntry> = new Map()
  ): readonly Tag[] {
    const tags = new Map<string, Tag>();

    for (const page of pages) {
      for (const occurrence of page.analysis.tags) {
        if (tags.has(occurrence.name)) {
          continue;
        }

        tags.set(occurrence.name, {
          name: occurrence.name,
          icon: tagMetadata.get(occurrence.name)?.icon,
        });
      }
    }

    return [...tags.values()];
  }
}
