import type { Page, Tag, TagMetadataEntry } from '../models';
import { TagIndex } from './TagIndex';

export class TagBuilder {
  /**
   * Tag existence is `used ∪ declared`: every tag any note uses (inline
   * `#tag` occurrences and frontmatter `tags`) plus every tag defined in
   * `.clutter/tags.json`, so a declared tag no note uses is still a Tag
   * (`usageCount: 0`) — never deleted just because it is unused.
   *
   * A from-scratch build is a fold of `TagIndex.upsertPage` over the pages
   * (the same code path the Vault uses incrementally), so this and the
   * incremental index cannot disagree. The stored `name` is always the exact
   * text the user typed (first-typed casing wins for one normalized
   * identity); normalizeTagName() is only a comparison/grouping key.
   */
  build(
    pages: readonly Page[],
    tagMetadata: ReadonlyMap<string, TagMetadataEntry> = new Map()
  ): readonly Tag[] {
    return TagIndex.build(pages, tagMetadata).tags();
  }
}
