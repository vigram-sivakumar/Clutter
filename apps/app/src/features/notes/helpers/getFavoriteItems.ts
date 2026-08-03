import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import {
  getPageDisplayLabel,
  getPageDisplayLabelStyle,
  toPageDisplayLabelInput,
} from '@core/presentation/getPageDisplayLabel';

import type { FavoriteItem } from '../models/FavoriteItem';

function toFavoriteItem(
  entry: Folder | Page,
  effectivePageState: EffectivePageState
): FavoriteItem {
  const isPage = 'type' in entry;

  // Folders always have a real, deliberate name (no placeholder chain
  // applies to them); pages go through the shared display-label rule so
  // a favorited-but-unnamed note doesn't show a raw "Untitled 2" — and
  // carry the source through so the row can render it with the correct
  // styling.
  //
  // Membership stays durable-only (query.getFavoritePages(), below) — a
  // draft can't be favorited, since the favorite flag lives in
  // PageMetadata, which a draft never has (ARCHITECTURE_RULES.md rule
  // 13's documented exception). The *label*, though, must still reflect
  // a currently-open session's live content rather than only what's on
  // disk, so it goes through EffectivePageState rather than the raw
  // Page directly. entry.id always resolves here in practice (it came
  // from this Vault's own favorites list), but getPage() is typed as
  // possibly undefined, so toPageDisplayLabelInput(entry) — the same
  // adapter every durable-only call site already uses — is the fallback,
  // not a second label rule.
  if (isPage) {
    const effectivePage = effectivePageState.getPage(entry.id);
    const label = getPageDisplayLabel(effectivePage ?? toPageDisplayLabelInput(entry));

    return {
      id: entry.id,
      title: label.text,
      titleStyle: getPageDisplayLabelStyle(label),
      type: 'note',
    };
  }

  return {
    id: entry.id,
    title: entry.name,
    titleStyle: 'default',
    type: 'folder',
  };
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
