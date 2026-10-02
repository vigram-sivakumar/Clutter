export type PageStatus = 'active' | 'archived';

/**
 * Where a page/folder's cover renders relative to the title — 'side'
 * (default, the original layout) or 'above' (spans the document width,
 * stacked above the title section). Orthogonal to `coverHidden`: layout
 * describes *where* a visible-or-hidden cover would render, not whether
 * it's currently shown.
 */
export type CoverLayout = 'side' | 'above';

export interface PageMetadata {
  readonly icon: string | null;
  readonly cover: string | null;
  /**
   * Whether an existing `cover` should render — distinct from `cover`
   * itself: hiding never clears the cover reference (asset/URL stays
   * intact, Remove is the only action that clears `cover`), it only
   * suppresses display, so a later "show" can restore it without the
   * user re-picking an image. See Page.Cover.tsx's `hidden` prop.
   */
  readonly coverHidden: boolean;
  /** See CoverLayout's own doc comment. Defaults to 'side' when absent. */
  readonly coverLayout: CoverLayout;
  /**
   * Normalized 0–100 focal position used when `coverLayout` is 'above'
   * (vertical axis only — horizontal stays centered at 50%). Defaults to 50
   * (centered) when absent. Independent of `coverPositionSide`: switching
   * `coverLayout` never reads or writes the other layout's saved position.
   * Set only via the cover's explicit "Save Position" action — never by
   * dragging alone, which is local preview state, not persisted metadata.
   */
  readonly coverPositionAbove: number;
  /**
   * Same contract as `coverPositionAbove`, for when `coverLayout` is 'side'
   * (horizontal axis only — vertical stays centered at 50%).
   */
  readonly coverPositionSide: number;
  readonly description: string | null;
  readonly favorite: boolean;

  readonly status: PageStatus;
  readonly archivedAt: string | null;

  readonly originalParentId: string | null;
  readonly originalPath: string | null;

  readonly createdAt: string | null;
  readonly updatedAt: string | null;

  /**
   * Note-level tags declared in frontmatter — independent of, and never
   * synchronized with, inline `#tag` occurrences in the body (see
   * `PageAnalysis.tags` for those; `TagOccurrence`s are content-level
   * facts, this is note-level metadata). Starts empty for a note whose
   * frontmatter has never had this field — deliberately NOT derived
   * from the body's own inline tags: doing so would make an
   * auto-populated value indistinguishable from one a user actually
   * wrote, which is exactly the "context entry vs. note entry"
   * distinction the Tags sidebar's expanded-tag children rely on
   * (renderTags.tsx) — every note with any inline tag would otherwise
   * silently also gain frontmatter membership for it. Set explicitly,
   * either by editing frontmatter directly or via the Tags sidebar's
   * "+" (PageOperations.updateMetadata); once set, `PageRebuilder`
   * always preserves the existing value when a later reparse's
   * frontmatter omits the key, rather than re-deriving or clearing it.
   *
   * Optional — unlike every other field here — so the many existing
   * test fixtures that construct a `PageMetadata` literal without this
   * field don't all need updating. Every real `Page` built by
   * `PageBuilder`/`PageRebuilder` always resolves it to a concrete
   * (possibly empty) array; treat it defensively (`?? []`) only when
   * handling a hand-constructed fixture, never a real `Page`.
   */
  readonly tags?: readonly string[];

  /**
   * The page's frontmatter `aliases`, in file order — the editable value
   * the Aliases Property shows and `PageOperations.updateMetadata` writes.
   * The file is the source of truth: a reparse always takes the list from
   * the document (an absent key is an empty list), so an external edit
   * that removes an alias is never resurrected. `Page.analysis.aliases`
   * is derived from the same parsed key for link resolution. Optional for
   * the same fixture-churn reason as `tags`; every real `Page` resolves it
   * to a concrete (possibly empty) array.
   */
  readonly aliases?: readonly string[];

  /**
   * Verbatim raw frontmatter lines for keys Clutter does not own (custom
   * keys). Round-tripped unchanged by FrontmatterSerializer so a Clutter
   * save never deletes frontmatter it doesn't manage. Opaque on purpose:
   * no consumer interprets it, so this is preservation, not a second
   * metadata representation. Optional, and absent when there is nothing
   * to preserve, for the same fixture-churn reason as `tags`.
   */
  readonly unownedFrontmatter?: readonly string[];

  /**
   * Canonical system key → the differently-cased spelling the file uses
   * for it (`{ aliases: 'Aliases' }`). System keys are recognized
   * case-insensitively, but a file's own spelling is kept on every save
   * until that property is actually edited — PageOperations.updateMetadata
   * drops a key's entry when its patch changes that property, so the
   * serializer then writes the canonical key. Like `unownedFrontmatter`,
   * always taken from the reparsed file. Optional, absent when every key
   * is spelled canonically.
   */
  readonly frontmatterKeySpellings?: Readonly<Record<string, string>>;
}
