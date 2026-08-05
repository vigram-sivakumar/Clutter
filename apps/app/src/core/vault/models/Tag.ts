// Vault-wide projection of a unique tag.
// A Tag represents a unique tag aggregated from all TagOccurrences in the
// vault, enriched with presentation metadata assigned separately by the
// user (see TagMetadataEntry) — never parsed from markdown, never stored
// on individual occurrences.
export interface Tag {
  readonly name: string;
  // Generic icon, not "emoji" — today's UI only offers an emoji picker, but
  // the domain concept is a reusable icon assigned to the Tag entity.
  readonly icon?: string;
}

// Presentation-only metadata assigned to a Tag entity by the user, keyed by
// normalized tag name in .clutter/tags.json. Not knowledge, not parsed from
// markdown, never duplicated onto TagOccurrence.
export interface TagMetadataEntry {
  readonly icon?: string;
}

/**
 * The single normalization rule for tag identity, shared by extraction
 * (TagExtractor), the metadata file (TagOperations, application bootstrap),
 * and the join between them (TagBuilder) — so "Project"/"project"/"PROJECT"
 * can never end up as distinct entries on either side.
 */
export function normalizeTagName(name: string): string {
  return name.toLowerCase();
}
