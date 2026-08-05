import type { Page, Tag, TagMetadataEntry } from '../models';

export class TagBuilder {
  /**
   * Markdown determines what tags exist — this loop only ever iterates
   * occurrences, never tagMetadata's keys, so a metadata-only entry with no
   * occurrence anywhere in the vault never manufactures a Tag (see
   * .clutter/tags.json's "only tags with metadata exist" / orphan-entry
   * handling). tagMetadata is enrichment consulted per name, once per
   * unique name — never a second source of tag existence.
   */
  build(
    pages: readonly Page[],
    tagMetadata: ReadonlyMap<string, TagMetadataEntry> = new Map()
  ): readonly Tag[] {
    // Tracks which pages reference each tag name — a Set, so a tag
    // mentioned five times in one page still only ever contributes that
    // page's id once. usageCount (below) is this set's size: unique pages,
    // never an occurrence count. No page-type distinction is made, so
    // notes and daily notes contribute identically.
    const pageIdsByTagName = new Map<string, Set<string>>();

    for (const page of pages) {
      for (const occurrence of page.analysis.tags) {
        if (!pageIdsByTagName.has(occurrence.name)) {
          pageIdsByTagName.set(occurrence.name, new Set());
        }

        pageIdsByTagName.get(occurrence.name)!.add(page.id);
      }
    }

    const tags: Tag[] = [...pageIdsByTagName.entries()].map(([name, pageIds]) => ({
      name,
      icon: tagMetadata.get(name)?.icon,
      favorite: tagMetadata.get(name)?.favorite ?? false,
      usageCount: pageIds.size,
    }));

    // Alphabetical (case-insensitive) is the default ordering for every
    // consumer of vault.tags() — sorted once here, not left to each reader
    // (sidebar, future collection views, search) to remember to do
    // themselves. Occurrence names are already normalized to lowercase by
    // TagExtractor, but comparing case-insensitively here doesn't depend on
    // that staying true.
    return tags.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  }
}
