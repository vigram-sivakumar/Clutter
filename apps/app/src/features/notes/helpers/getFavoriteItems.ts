import type { Folder } from '@core/vault/models/Folder';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { EffectivePage, EffectivePageState } from '@core/application/page/EffectivePageState';
import type { MoveZone } from '@core/vault/initialize/ReservedResources';
import { buildEntryPresentation } from '@core/presentation/buildEntryPresentation';

import type { FavoriteItem } from '../models/FavoriteItem';

function assetsZoneOnly(zone: MoveZone): 'assets' | undefined {
  return zone === 'assets' ? 'assets' : undefined;
}

function toFavoriteItem(
  entry: Folder | EffectivePage,
  getFolderMoveZone: (folderId: string | null) => MoveZone
): FavoriteItem {
  const isPage = 'type' in entry;
  const { title, titleStyle, emoji } = buildEntryPresentation(entry);

  return {
    id: entry.id,
    title,
    name: entry.name,
    titleStyle,
    emoji,
    type: isPage ? 'note' : 'folder',
    // Favorites list only items outside Archive/ (location decides), so a folder here is active
    // whatever stale provenance its own status carries.
    status: isPage ? undefined : 'active',
    // A page knows it is a Template (EffectivePage.isTemplate); a folder sits in a Move hierarchy.
    isTemplate: isPage && entry.isTemplate ? true : undefined,
    moveZone: isPage ? undefined : assetsZoneOnly(getFolderMoveZone(entry.id)),
  };
}

export function toFavoriteItems(
  folders: readonly Folder[],
  pages: readonly EffectivePage[],
  getFolderMoveZone: (folderId: string | null) => MoveZone = () => 'workspace'
): FavoriteItem[] {
  return [
    ...folders.map((folder) => toFavoriteItem(folder, getFolderMoveZone)),
    ...pages.map((page) => toFavoriteItem(page, getFolderMoveZone)),
  ];
}

export function getFavoriteItems(
  query: VaultQuery,
  effectivePageState: EffectivePageState,
  getFolderMoveZone: (folderId: string | null) => MoveZone = () => 'workspace'
): FavoriteItem[] {
  // Membership is durable-only (a draft can't be favorited — the favorite
  // flag lives in PageMetadata, which a draft never has,
  // ARCHITECTURE_RULES.md rule 13's documented exception); the
  // *presentation* still reflects a currently-open session's live content,
  // via EffectivePageState.getFavoritePages() — the single owner of that
  // reconciliation (ADR-022), also used by the Favorites collection page.
  return toFavoriteItems(
    query.getFavoriteFolders(),
    effectivePageState.getFavoritePages(),
    getFolderMoveZone
  );
}
