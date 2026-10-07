import type { Page, Tag, TagMetadataEntry } from '../models';
import { normalizeTagName, serializeTagName } from '../models/Tag';

const COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base' });

/**
 * The runtime tag index: derived, disposable, never persisted, always
 * reconstructable from Markdown (page analysis + frontmatter `tags`) plus the
 * declared-tag definitions from `.clutter/tags.json`.
 *
 * Answers `tag → pages`, `tag → usage count` and (through the page's own
 * `analysis.tags`) `tag → occurrences`, and projects the vault-wide `Tag[]`
 * as `used ∪ declared`.
 *
 * Incremental by construction: each page's contribution is recorded, so
 * `upsertPage`/`removePage` replace only that page's contribution — one note
 * changing never re-reads the other pages — and `setDeclared` swaps the
 * definitions without touching usage at all. A full build is nothing but
 * `upsertPage` over every page, so the incremental and from-scratch paths
 * cannot disagree (apart from which casing wins "first-typed" after a tag's
 * first spelling disappears).
 */
export class TagIndex {
  // key → (pageId → spelling that page uses first). Map order = first-typed
  // order, which decides the display casing.
  private readonly usageByKey = new Map<string, Map<string, string>>();
  // pageId → the keys it contributed, so a replace only touches what differs.
  private readonly keysByPage = new Map<string, ReadonlyMap<string, string>>();
  private declared: ReadonlyMap<string, TagMetadataEntry>;
  private cached: readonly Tag[] | null = null;

  constructor(declared: ReadonlyMap<string, TagMetadataEntry> = new Map()) {
    this.declared = declared;
  }

  static build(pages: Iterable<Page>, declared?: ReadonlyMap<string, TagMetadataEntry>): TagIndex {
    const index = new TagIndex(declared);

    for (const page of pages) {
      index.upsertPage(page);
    }

    return index;
  }

  setDeclared(declared: ReadonlyMap<string, TagMetadataEntry>): void {
    this.declared = declared;
    this.cached = null;
  }

  /** Replaces `page`'s whole contribution with what its current Markdown/frontmatter says. */
  upsertPage(page: Page): void {
    const next = this.contributionOf(page);
    const previous = this.keysByPage.get(page.id);

    if (previous) {
      for (const key of previous.keys()) {
        if (!next.has(key)) {
          this.dropUsage(key, page.id);
        }
      }
    }

    for (const [key, spelling] of next) {
      let usage = this.usageByKey.get(key);

      if (!usage) {
        usage = new Map();
        this.usageByKey.set(key, usage);
      }

      usage.set(page.id, spelling);
    }

    this.keysByPage.set(page.id, next);
    this.cached = null;
  }

  removePage(pageId: string): void {
    const previous = this.keysByPage.get(pageId);

    if (!previous) {
      return;
    }

    for (const key of previous.keys()) {
      this.dropUsage(key, pageId);
    }

    this.keysByPage.delete(pageId);
    this.cached = null;
  }

  /** `tag → pages`: ids of the pages that use `key` (a normalized name). Empty for unused/unknown. */
  pageIdsFor(key: string): readonly string[] {
    return Array.from(this.usageByKey.get(key)?.keys() ?? []);
  }

  /** `used ∪ declared`, alphabetical (case-insensitive) — the default order for every consumer. */
  tags(): readonly Tag[] {
    if (this.cached) {
      return this.cached;
    }

    const tags: Tag[] = [];

    for (const [key, usage] of this.usageByKey) {
      const definition = this.declared.get(key);

      tags.push({
        // First-typed casing wins; the separators are always canonical (hyphens).
        name: serializeTagName(usage.values().next().value as string),
        icon: definition?.icon,
        favorite: definition?.favorite ?? false,
        declared: definition !== undefined,
        usageCount: usage.size,
      });
    }

    for (const [key, definition] of this.declared) {
      if (!this.usageByKey.has(key)) {
        tags.push({
          name: serializeTagName(definition.name ?? key),
          icon: definition.icon,
          favorite: definition.favorite ?? false,
          declared: true,
          usageCount: 0,
        });
      }
    }

    this.cached = tags.sort((a, b) => COLLATOR.compare(a.name, b.name));

    return this.cached;
  }

  private dropUsage(key: string, pageId: string): void {
    const usage = this.usageByKey.get(key);

    if (!usage) {
      return;
    }

    usage.delete(pageId);

    if (usage.size === 0) {
      this.usageByKey.delete(key);
    }
  }

  /**
   * A tag a note uses is either an inline `#tag` in its body or a name in
   * its frontmatter `tags` (what the Properties Tags editor writes) — both
   * are the persisted note, and the same tag under normalizeTagName. A page
   * holding it both ways is one page of that tag.
   */
  private contributionOf(page: Page): ReadonlyMap<string, string> {
    const contribution = new Map<string, string>();
    const names = [
      ...page.analysis.tags.map((occurrence) => occurrence.name),
      ...(page.metadata.tags ?? []),
    ];

    for (const name of names) {
      const key = normalizeTagName(name);

      if (key && !contribution.has(key)) {
        contribution.set(key, name);
      }
    }

    return contribution;
  }
}
