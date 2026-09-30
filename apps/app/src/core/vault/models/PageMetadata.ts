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
}
