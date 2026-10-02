// Every frontmatter key Clutter itself reads into PageFrontmatter (and
// writes back via FrontmatterSerializer) — the canonical system keys.
// FrontmatterParser uses it to decide what it parses vs. preserves, and
// customFrontmatter.ts uses it as the reserved-name set a custom property
// can't be renamed to (case-insensitively), so the two can never drift.
// Any other key is not Clutter's to rewrite: its raw lines are captured
// verbatim into `unownedLines` so a save round-trips them instead of
// dropping them.
// `type` stays here deliberately: it is a retired, inert legacy key that
// is parsed but intentionally NOT preserved (see FrontmatterSerializer).
export const OWNED_FRONTMATTER_KEYS: ReadonlySet<string> = new Set([
  'id',
  'type',
  'icon',
  'cover',
  'coverHidden',
  'coverLayout',
  'coverPositionAbove',
  'coverPositionSide',
  'description',
  'favorite',
  'status',
  'archivedAt',
  'originalParentId',
  'originalPath',
  'created',
  'modified',
  'tags',
  // Owned since the Aliases Property made it editable: parsed into
  // PageFrontmatter.aliases (every form below) and written back by
  // FrontmatterSerializer, so it must not also be captured verbatim.
  'aliases',
]);

/** Every owned key by its comparison form (trimmed, lower-cased). */
const OWNED_KEY_BY_LOWER: ReadonlyMap<string, string> = new Map(
  [...OWNED_FRONTMATTER_KEYS].map((key) => [key.toLowerCase(), key])
);

/**
 * The canonical system key `rawKey` denotes, or null for a custom key.
 * An exact normalized comparison — trimmed, case-insensitive (`Aliases`,
 * `ALIASES` and `aLiAsEs` are all `aliases`) — never fuzzy or semantic
 * (`Date Created` is not `created`). One exception: the retired `type` key
 * matches only exactly, since FrontmatterParser recognizes it solely to
 * drop it on save — a user's own `Type:` stays a preserved custom key
 * rather than being silently deleted.
 */
export function matchSystemKey(rawKey: string): string | null {
  const trimmed = rawKey.trim();
  const canonical = OWNED_KEY_BY_LOWER.get(trimmed.toLowerCase()) ?? null;

  if (canonical === 'type' && trimmed !== 'type') {
    return null;
  }

  return canonical;
}

/**
 * Frontmatter keys Clutter reserves for its own UI configuration but does
 * NOT parse: their lines stay in the preserved raw lines
 * (PageMetadata.unownedFrontmatter), written back byte-identical, and a
 * dedicated reader/writer handles the part Clutter uses. So they are
 * deliberately not in OWNED_FRONTMATTER_KEYS — adding one there would make
 * the flat, line-based FrontmatterParser stop capturing its lines.
 *
 * - `properties`: holds `visible`, the canonical keys of the Properties a
 *   note shows (propertyVisibility.ts). It is never a custom Property: not
 *   listed as one, and not a name one can be given, in any letter case.
 */
export const RESERVED_RAW_FRONTMATTER_KEYS: ReadonlySet<string> = new Set(['properties']);

/** Whether `key` is a reserved raw key, ignoring letter case and surrounding space. */
export function isReservedRawKey(key: string): boolean {
  return RESERVED_RAW_FRONTMATTER_KEYS.has(key.trim().toLowerCase());
}
