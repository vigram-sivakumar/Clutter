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
 *
 * Also folds `-`/`_` to the same identity: "product-design",
 * "product_design", and "PRODUCT-DESIGN" are one logical tag, per the
 * product decision that Clutter's two supported separator characters are
 * interchangeable for identity purposes even though neither is rewritten
 * in the source (see `formatTagDisplayLabel`/`serializeTagName` below for
 * the two places that separator distinction still matters: display and
 * new-tag serialization, never identity).
 */
export function normalizeTagName(name: string): string {
  return name.toLowerCase().replace(/[-_]+/g, ' ');
}

/**
 * The single separator-to-space display rule, shared by every surface
 * that shows a tag to a user (the editor's at-rest `TagWidget`, the
 * autocomplete popup) — "product-design"/"product_design" both display as
 * "product design", casing preserved from whatever's passed in (the
 * caller is responsible for passing the vault's *preferred* casing, e.g.
 * via `Vault.getTagByName`, not just whatever one occurrence happens to
 * spell it — see `resolveTag.ts`/`tagSuggestions.ts`). Pure and
 * presentation-only: never applied to what's read from or written back to
 * Markdown, only to what's rendered on screen.
 */
export function formatTagDisplayLabel(name: string): string {
  return name.replace(/[-_]+/g, ' ');
}

/**
 * The inverse of `formatTagDisplayLabel`, for the one place Clutter itself
 * generates new tag Markdown (autocomplete insertion, both a brand-new tag
 * and one built from an existing suggestion's display label): spaces
 * become `-`, the canonical serialized separator. Never applied to
 * existing source text — Clutter reads `-`/`_` leniently but only ever
 * writes `-` for tags it creates itself (`docs/editor-architecture-
 * decisions.md`'s "lenient reader, strict writer" rule, same convention
 * already governing WikiLink path/alias serialization).
 */
export function serializeTagName(displayLabel: string): string {
  return displayLabel.replace(/\s+/g, '-');
}
