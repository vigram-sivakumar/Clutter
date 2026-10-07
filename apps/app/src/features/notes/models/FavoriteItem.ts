import type { FolderMetadata } from '@core/vault/models/FolderMetadata';

/**
 * `status` is folder-only (the canonical folder actions need it to decide
 * whether 'archive' is offered) — undefined for a 'note' item, since
 * getFavoriteItems only ever surfaces non-archived pages to begin with.
 */
export type FavoriteItem = {
  id: string;
  title: string;
  /** The resource's own name (a note's file name, a folder's name) — what an inline rename edits, unlike `title`, the display label. */
  name?: string;
  titleStyle: 'default' | 'placeholder';
  type: 'note' | 'folder';
  emoji: string | null;
  status?: FolderMetadata['status'];
  /** A note that lives in Templates — it has no Move and no Create template. Set only when true. */
  isTemplate?: boolean;
  /** A folder inside Assets — its Move picker is rooted there. Set only when not the workspace. */
  moveZone?: 'assets';
};
