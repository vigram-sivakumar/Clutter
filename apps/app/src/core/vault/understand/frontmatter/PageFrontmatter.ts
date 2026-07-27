import type { PageType } from '../../models';
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
  description?: string;
  favorite?: boolean;
  originalParentId?: string | null;
  created?: string;
  modified?: string;
}
