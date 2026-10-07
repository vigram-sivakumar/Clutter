import type { FolderMetadata } from '@core/vault/models/FolderMetadata';

/**
 * `status` is folder-only (the canonical folder actions need it to decide
 * whether 'archive' is offered) — undefined for a 'note' item, since
 * getFavoriteItems only ever surfaces non-archived pages to begin with.
 */
export type FavoriteItem = {
  id: string;
  title: string;
  titleStyle: 'default' | 'placeholder';
  type: 'note' | 'folder';
  emoji: string | null;
  status?: FolderMetadata['status'];
  /** A note that lives in Templates — its Move picker is rooted at Templates. Set only when true. */
  isTemplate?: boolean;
  /** A folder inside Templates or Assets — its Move picker is rooted there. Set only when not the workspace. */
  moveZone?: 'templates' | 'assets';
};
