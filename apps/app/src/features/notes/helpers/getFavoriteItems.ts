import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import { getPageDisplayLabel } from '@core/presentation/getPageDisplayLabel';

import type { FavoriteItem } from '../models/FavoriteItem';

function toFavoriteItem(entry: Folder | Page): FavoriteItem {
  const isPage = 'type' in entry;

  // Folders always have a real, deliberate name (no placeholder chain
  // applies to them); pages go through the shared display-label rule so
  // a favorited-but-unnamed note doesn't show a raw "Untitled 2" — and
  // carry the source through so the row can render it as a placeholder,
  // not just different text.
  const label = isPage ? getPageDisplayLabel(entry) : null;

  return {
    id: entry.id,
    title: label ? label.text : entry.name,
    titleStyle: label?.source === 'placeholder' ? 'placeholder' : 'default',
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
