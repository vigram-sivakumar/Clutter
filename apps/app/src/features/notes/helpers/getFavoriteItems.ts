import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import {
  buildEntryPresentation,
  type EntryPresentationPageInput,
} from '@core/presentation/buildEntryPresentation';
import { toPageDisplayLabelInput } from '@core/presentation/getPageDisplayLabel';

import type { FavoriteItem } from '../models/FavoriteItem';

function toFavoriteItem(
  entry: Folder | Page,
  effectivePageState: EffectivePageState
): FavoriteItem {
  const isPage = 'type' in entry;

  if (isPage) {
    // Membership stays durable-only (query.getFavoritePages(), below) — a
    // draft can't be favorited, since the favorite flag lives in
    // PageMetadata, which a draft never has (ARCHITECTURE_RULES.md rule
    // 13's documented exception). The *presentation*, though, must still
    // reflect a currently-open session's live content rather than only
    // what's on disk, so it goes through EffectivePageState rather than
    // the raw Page directly. entry.id always resolves here in practice
    // (it came from this Vault's own favorites list), but getPage() is
    // typed as possibly undefined, so the raw Page — adapted via the same
    // toPageDisplayLabelInput() every durable-only call site already
    // uses, plus its own metadata.icon — is the fallback, not a second
    // presentation rule.
    const effectivePage = effectivePageState.getPage(entry.id);
    const presentationInput: EntryPresentationPageInput =
      effectivePage ?? { ...toPageDisplayLabelInput(entry), icon: entry.metadata.icon };

    const { title, titleStyle, emoji } = buildEntryPresentation(presentationInput);

    return { id: entry.id, title, titleStyle, emoji, type: 'note' };
  }

  const { title, titleStyle, emoji } = buildEntryPresentation(entry);

  return { id: entry.id, title, titleStyle, emoji, type: 'folder' };
}

export function toFavoriteItems(
  folders: readonly Folder[],
  pages: readonly Page[],
  effectivePageState: EffectivePageState
): FavoriteItem[] {
  return [
    ...folders.map((folder) => toFavoriteItem(folder, effectivePageState)),
    ...pages.map((page) => toFavoriteItem(page, effectivePageState)),
  ];
}

export function getFavoriteItems(
  query: VaultQuery,
  effectivePageState: EffectivePageState
): FavoriteItem[] {
  return toFavoriteItems(
    query.getFavoriteFolders(),
    query.getFavoritePages(),
    effectivePageState
  );
}
