// Vault-wide projection of a unique tag.
//
// Tag existence = used tags ∪ declared tags. A Tag is the union of every
// tag name found in Markdown (inline `#tag` occurrences and every note's
// frontmatter `tags`) and every tag *declared* in `.clutter/tags.json`
// (TagMetadataEntry) — so a declared tag that no note uses yet is a real,
// first-class Tag with `usageCount: 0`. Presentation/configuration comes
// from the metadata file; `usageCount` and everything about *where* the
// tag is used is derived from Markdown and never persisted.
export interface Tag {
  readonly name: string;
  // Generic icon, not "emoji" — today's UI only offers an emoji picker, but
  // the domain concept is a reusable icon assigned to the Tag entity.
  readonly icon?: string;
  // Always resolved to a real boolean (never undefined) on the domain
  // model, mirroring FolderMetadata.favorite/PageMetadata.favorite.
  readonly favorite: boolean;
  // Whether `.clutter/tags.json` holds a definition for this tag. A used,
  // never-configured tag is `false`; a configured or explicitly created tag
  // is `true` and keeps existing at zero usage.
  readonly declared: boolean;
  // Number of unique pages (notes and daily notes alike — no distinction
  // made) that reference this tag at least once. Not an occurrence count:
  // five #project mentions in one note contribute 1, not 5. Derived
  // entirely from Pages (TagIndex), same as the rest of the usage data —
  // never stored, never able to drift from what Markdown actually contains.
  // 0 for a declared-but-unused tag.
  readonly usageCount: number;
}

// One tag's definition in `.clutter/tags.json`, keyed by normalized tag
// name. **The presence of an entry is what "declared" means** — there is no
// separate flag, so an entry may legitimately be empty (`{}`): a tag created
// on purpose before it has any configuration or usage. Not knowledge, not
// parsed from markdown, never duplicated onto TagOccurrence.
//
// Schema evolution: new optional fields (e.g. a future `color`) are
// non-breaking — readers ignore fields they don't know, and the metadata
// store round-trips unknown fields untouched on every write.
export interface TagMetadataEntry {
  // The spelling to show/serialize while no note spells the tag (a used
  // tag always shows the spelling Markdown uses). Set whenever Clutter
  // writes the entry; absent in hand-written entries, where the tag's
  // canonical serialized form (`serializeTagName(key)`) is used instead.
  readonly name?: string;
  readonly icon?: string;
  // Optional (absent in hand-edited files) but always defaulted to false
  // where it's read into the domain model — see TagIndex.
  readonly favorite?: boolean;
}

/**
 * The single normalization rule for tag identity, shared by extraction
 * consumers (TagIndex), the metadata file (TagMetadataStore, TagOperations),
 * and the join between them — so "Project"/"project"/"PROJECT" can never
 * end up as distinct entries on either side.
 *
 * Unicode NFKC + case folding (UAX #31's recommendation for case-insensitive
 * identifiers), default-ignorable characters (zero-width joiners, BOM, soft
 * hyphen …) dropped so invisible characters can't create look-alike tags,
 * and `-`/`_`/whitespace runs folded to one space: "product-design",
 * "product_design", "PRODUCT-DESIGN" and "product design" are one logical
 * tag, per the product decision that Clutter's separator characters are
 * interchangeable for identity even though none is rewritten in the source
 * (see `formatTagDisplayLabel`/`serializeTagName` below for the two places
 * the separator distinction still matters: display and new-tag
 * serialization, never identity). Confusable scripts are deliberately NOT
 * merged (UTS #39 is for detection, not identity).
 */
export function normalizeTagName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/g, '')
    .toLowerCase()
    .replace(/[-_\s]+/g, ' ')
    .trim();
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
 * The canonical spelling of a tag: hyphens. Spaces, underscores and runs of
 * separators all become one `-`, and none are left dangling at either end —
 * `design_system`, `design system` and `Design--System` are all
 * `Design-System` (casing is preserved; it is never part of identity).
 *
 * This is what Clutter *shows and writes*: `Tag.name`, a renamed tag's new
 * Markdown, a newly-created tag, autocomplete insertion. It is never applied
 * to text already in a note ("lenient reader, strict writer",
 * `docs/editor-architecture-decisions.md`): `#design_system` typed by the
 * user stays as typed until a rename rewrites it, yet is the same tag as
 * `#design-system` everywhere (`normalizeTagName`).
 */
export function serializeTagName(displayLabel: string): string {
  return displayLabel.trim().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * The three casings of a one-time "restyle existing tags" cleanup (Tags
 * sidebar → Configure). Deliberately a closed, three-member set and never
 * stored anywhere — not in `.clutter/tags.json`, not as a preference — so a
 * restyle can never influence how a *new* tag is created (that stays
 * `serializeTagName(normalizeTagName(x))`, lower-case, as before).
 */
export type TagStyle = 'lowercase' | 'sentence' | 'title';

/**
 * Re-cases `name` in `style`, touching nothing but letter case: separators
 * (`-`, `_`, whitespace) are word boundaries and are kept exactly as given,
 * so a restyle never rewrites what a note's author typed beyond its casing.
 * Tag *identity* is unaffected — `normalizeTagName` folds case, so the input
 * and the output are always the same logical tag.
 *
 * - `lowercase` → `design-system`
 * - `sentence`  → `Design-system` (first word only)
 * - `title`     → `Design-System` (every word)
 *
 * Idempotent (`applyTagStyle(applyTagStyle(x, s), s)` equals the first result),
 * which is what lets a restyle batch be re-run to finish a partial run, and
 * locale-independent (`toLowerCase`/`toUpperCase` without a locale). A word's
 * first letter is upper-cased only when that stays one character (`ß` is left
 * alone rather than becoming `SS`, which would not survive a second pass).
 */
export function applyTagStyle(name: string, style: TagStyle): string {
  let seenWord = false;

  // The capture group keeps separators in the result: even indexes are
  // words, odd indexes are the separator runs between them.
  return name
    .split(/([-_\s]+)/)
    .map((part, index) => {
      if (index % 2 === 1 || part === '') {
        return part;
      }

      const lower = part.toLowerCase();
      const capitalize = style === 'title' || (style === 'sentence' && !seenWord);
      seenWord = true;

      return capitalize ? capitalizeFirst(lower) : lower;
    })
    .join('');
}

function capitalizeFirst(word: string): string {
  const [first = ''] = word; // first code point, not first UTF-16 unit
  const upper = first.toUpperCase();

  return (upper.length === first.length ? upper : first) + word.slice(first.length);
}
