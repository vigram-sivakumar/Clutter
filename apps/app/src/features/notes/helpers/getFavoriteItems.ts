import type { Folder } from '@core/vault/models/Folder';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { EffectivePage, EffectivePageState } from '@core/application/page/EffectivePageState';
import { buildEntryPresentation } from '@core/presentation/buildEntryPresentation';

import type { FavoriteItem } from '../models/FavoriteItem';

function toFavoriteItem(entry: Folder | EffectivePage): FavoriteItem {
  const isPage = 'type' in entry;
  const { title, titleStyle, emoji } = buildEntryPresentation(entry);

  return {
    id: entry.id,
    title,
    titleStyle,
    emoji,
    type: isPage ? 'note' : 'folder',
    status: isPage ? undefined : entry.metadata.status,
  };
}

export function toFavoriteItems(
  folders: readonly Folder[],
  pages: readonly EffectivePage[]
): FavoriteItem[] {
  return [...folders.map(toFavoriteItem), ...pages.map(toFavoriteItem)];
}

export function getFavoriteItems(
  query: VaultQuery,
  effectivePageState: EffectivePageState
): FavoriteItem[] {
  // Membership is durable-only (a draft can't be favorited — the favorite
  // flag lives in PageMetadata, which a draft never has,
  // ARCHITECTURE_RULES.md rule 13's documented exception); the
  // *presentation* still reflects a currently-open session's live content,
  // via EffectivePageState.getFavoritePages() — the single owner of that
  // reconciliation (ADR-022), also used by the Favorites collection page.
  return toFavoriteItems(query.getFavoriteFolders(), effectivePageState.getFavoritePages());
}
