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
