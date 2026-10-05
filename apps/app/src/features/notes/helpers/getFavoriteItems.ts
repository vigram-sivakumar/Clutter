import type { Folder } from '@core/vault/models/Folder';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { EffectivePage, EffectivePageState } from '@core/application/page/EffectivePageState';
import { buildEntryPresentation } from '@core/presentation/buildEntryPresentation';

import type { FavoriteItem } from '../models/FavoriteItem';

function toFavoriteItem(
  entry: Folder | EffectivePage,
  isInTemplates: (folderId: string | null) => boolean
): FavoriteItem {
  const isPage = 'type' in entry;
  const { title, titleStyle, emoji } = buildEntryPresentation(entry);

  return {
    id: entry.id,
    title,
    titleStyle,
    emoji,
    type: isPage ? 'note' : 'folder',
    status: isPage ? undefined : entry.metadata.status,
    isTemplate: isPage && isInTemplates(entry.folderId) ? true : undefined,
  };
}

export function toFavoriteItems(
  folders: readonly Folder[],
  pages: readonly EffectivePage[],
  isInTemplates: (folderId: string | null) => boolean = () => false
): FavoriteItem[] {
  return [
    ...folders.map((folder) => toFavoriteItem(folder, isInTemplates)),
    ...pages.map((page) => toFavoriteItem(page, isInTemplates)),
  ];
}

export function getFavoriteItems(
  query: VaultQuery,
  effectivePageState: EffectivePageState,
  isInTemplates: (folderId: string | null) => boolean = () => false
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
    isInTemplates
  );
}
