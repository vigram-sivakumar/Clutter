import type { FolderMetadata } from '@core/vault/models/FolderMetadata';

/**
 * `status` is folder-only (buildFolderSidebarMenu needs it to decide
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
};
