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
  // Always resolved to a real boolean (never undefined) on the domain
  // model, mirroring FolderMetadata.favorite/PageMetadata.favorite — unlike
  // icon, "not yet decided" isn't a meaningful state for favorite. No
  // mutation path sets this yet (see TagMetadataEntry.favorite); it exists
  // so favorite-based grouping is correct today and needs no redesign once
  // toggling ships.
  readonly favorite: boolean;
  // Number of unique pages (notes and daily notes alike — no distinction
  // made) that reference this tag at least once. Not an occurrence count:
  // five #project mentions in one note contribute 1, not 5. Derived
  // entirely from Pages (TagBuilder), same as the rest of Tag — never
  // stored, never able to drift from what Markdown actually contains.
  readonly usageCount: number;
}

// Presentation-only metadata assigned to a Tag entity by the user, keyed by
// normalized tag name in .clutter/tags.json. Not knowledge, not parsed from
// markdown, never duplicated onto TagOccurrence.
export interface TagMetadataEntry {
  readonly icon?: string;
  // Optional here (absent in hand-edited or pre-existing files) but always
  // defaulted to false where it's read into the domain model — see
  // TagBuilder. No UI or TagOperations call sets this yet.
  readonly favorite?: boolean;
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
