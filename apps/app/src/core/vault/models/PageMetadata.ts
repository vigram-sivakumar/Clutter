export type PageStatus = 'active' | 'archived';

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
  readonly description: string | null;
  readonly favorite: boolean;

  readonly status: PageStatus;
  readonly archivedAt: string | null;

  readonly originalParentId: string | null;
  readonly originalPath: string | null;

  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}
