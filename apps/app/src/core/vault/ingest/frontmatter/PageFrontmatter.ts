import type { CoverCredit, CoverLayout, PageStatus, PageType } from '../../models';
/**
 * Canonical metadata stored in every Clutter page.
 *
 * This interface represents the source-of-truth metadata embedded in a
 * Markdown file's frontmatter. Parsing and serialization must both use this
 * model.
 */
export interface PageFrontmatter {
  id?: string;
  type?: PageType;
  icon?: string;
  cover?: string;
  coverCredit?: CoverCredit;
  coverHidden?: boolean;
  coverLayout?: CoverLayout;
  coverPositionAbove?: number;
  coverPositionSide?: number;
  description?: string;
  favorite?: boolean;
  status?: PageStatus;
  archivedAt?: string | null;
  originalPath?: string | null;
  originalParentId?: string | null;
  /** `true` when a new note is written declaring the Created property (ADR-058); never read back — the key's presence is the declaration. */
  created?: boolean;
  /** Same, for Last edited. */
  modified?: boolean;
  /** See PageMetadata.tags's own doc comment — note-level, independent of inline `#tag` occurrences. */
  tags?: string[];
  /** See PageMetadata.aliases's own doc comment. Non-empty, trimmed, unquoted values in file order. */
  aliases?: string[];
  /**
   * Verbatim raw lines of every frontmatter key Clutter does not own
   * (custom keys) —
   * see FrontmatterParser's OWNED_FRONTMATTER_KEYS. Carried through
   * PageMetadata.unownedFrontmatter so FrontmatterSerializer can write them
   * back unchanged. Set when constructing a new page only for a draft whose first change is a
   * custom property (PageOperations.persistDraft).
   */
  unownedLines?: readonly string[];
  /**
   * Canonical system key → the spelling this file uses for it, only for
   * keys the file spells differently (`Aliases:` → { aliases: 'Aliases' }).
   * Carried through PageMetadata.frontmatterKeySpellings. Never set when
   * constructing a new page.
   */
  keySpellings?: Readonly<Record<string, string>>;
  /**
   * The file's top-level entries in their physical order, each once: a system key by its canonical
   * name (`created`, `tags`, …), any other key — a custom property, `properties` — as written
   * (unquoted). The order the Properties list shows, and the order FrontmatterSerializer writes the
   * entries back in. Carried through PageMetadata.frontmatterEntryOrder. Never set when constructing a
   * new page (it is then written in the serializer's default order).
   */
  entryOrder?: readonly string[];
}
