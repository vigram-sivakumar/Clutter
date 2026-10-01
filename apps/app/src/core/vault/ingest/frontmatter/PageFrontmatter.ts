import type { CoverLayout, PageStatus, PageType } from '../../models';
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
  created?: string;
  modified?: string;
  /** See PageMetadata.tags's own doc comment — note-level, independent of inline `#tag` occurrences. */
  tags?: string[];
  /**
   * Verbatim raw lines of every frontmatter key Clutter does not own
   * (custom keys, and `aliases`, which Clutter reads but never writes) —
   * see FrontmatterParser's OWNED_FRONTMATTER_KEYS. Carried through
   * PageMetadata.unownedFrontmatter so FrontmatterSerializer can write them
   * back unchanged. Never set when constructing a new page.
   */
  unownedLines?: readonly string[];
}
