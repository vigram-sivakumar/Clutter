import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';

import type { FavoriteItem } from '../models/FavoriteItem';

function toFavoriteItem(entry: Folder | Page): FavoriteItem {
  const isPage = 'type' in entry;

  return {
    id: entry.id,
    title: entry.name,
    type: isPage ? 'note' : 'folder',
  };
}

export function toFavoriteItems(
  folders: readonly Folder[],
  pages: readonly Page[]
): FavoriteItem[] {
  return [...folders.map(toFavoriteItem), ...pages.map(toFavoriteItem)];
}

export function getFavoriteItems(query: VaultQuery): FavoriteItem[] {
  return toFavoriteItems(query.getFavoriteFolders(), query.getFavoritePages());
}
