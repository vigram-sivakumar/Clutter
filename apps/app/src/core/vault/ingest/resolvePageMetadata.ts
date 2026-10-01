import type { PageFrontmatter } from './frontmatter/PageFrontmatter';
import type { PageMetadata } from '../models/PageMetadata';

/**
 * Resolves complete PageMetadata from raw, possibly-incomplete frontmatter —
 * the exact defaulting PageBuilder needs when a scanned file's frontmatter
 * omits a field. Extracted from PageBuilder so a second caller (draft
 * promotion's "is this a committed change" check, PageOperations) can ask
 * "what does a blank page's metadata look like" by calling the same logic
 * PageBuilder already runs, rather than a second, separately-maintained
 * table of the same facts.
 */
export function resolvePageMetadata(frontmatter: PageFrontmatter): PageMetadata {
  return {
    icon: frontmatter.icon ?? null,
    cover: frontmatter.cover ?? null,
    coverHidden: frontmatter.coverHidden ?? false,
    coverLayout: frontmatter.coverLayout ?? 'side',
    coverPositionAbove: frontmatter.coverPositionAbove ?? 50,
    coverPositionSide: frontmatter.coverPositionSide ?? 50,
    description: frontmatter.description ?? null,
    favorite: frontmatter.favorite ?? false,
    status: frontmatter.status ?? 'active',
    archivedAt: frontmatter.archivedAt ?? null,
    originalPath: frontmatter.originalPath ?? null,
    originalParentId: frontmatter.originalParentId ?? null,
    createdAt: frontmatter.created ?? null,
    updatedAt: frontmatter.modified ?? null,
    // Plain default here — the initial-population-from-inline-tags
    // fallback (when frontmatter omits this entirely) is PageBuilder's
    // own concern, not this general-purpose defaulter's: it needs the
    // scanned page's inline tag occurrences, which this function never
    // sees. See PageBuilder.build() and PageMetadata.tags's own doc
    // comment.
    tags: frontmatter.tags ?? [],
  };
}
