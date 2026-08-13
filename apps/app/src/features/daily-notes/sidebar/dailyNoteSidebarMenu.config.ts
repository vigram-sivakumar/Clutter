import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import {
  ARCHIVE_ACTION_LABEL,
  DELETE_ACTION_LABEL,
  FAVORITE_ACTION_LABEL,
  UNFAVORITE_ACTION_LABEL,
} from '@core/presentation/resourceActionLabels';

/**
 * Same action-building pattern as noteSidebarMenu.config.ts's
 * buildNoteSidebarMenu — capability-driven, only ever listing what's
 * actually available. A draft (no Vault entry yet) gets no menu items:
 * archive/delete/favorite require persistence, and — unlike a draft Note —
 * rename isn't offered for a draft Daily Note either, matching the
 * persisted branch's own restriction (dailyNoteTopBarMenu.config.ts has no
 * Rename item at all, since a Daily Note's title is its permanent,
 * date-derived calendar identity per PageHost's isRenameable guard).
 * OverflowMenu itself renders nothing when given an empty item list.
 *
 * `isFavorite` (default false, matching a draft's always-false state)
 * picks the item's label/icon — same `toggle-favorite` id and
 * PageOperations.updateMetadata({ favorite }) call the topbar and the
 * Notes sidebar tree both use, not a separate implementation.
 */
export function buildDailyNoteSidebarMenu(
  isDraft: boolean,
  isFavorite: boolean = false
): OverflowMenuItemConfig[] {
  if (isDraft) {
    return [];
  }

  return [
    {
      id: 'toggle-favorite',
      label: isFavorite ? UNFAVORITE_ACTION_LABEL : FAVORITE_ACTION_LABEL,
      icon: isFavorite ? 'favouriteFilled' : 'favouriteOutline',
    },
    { id: 'archive', label: ARCHIVE_ACTION_LABEL, icon: 'archive' },
    { id: 'delete', label: DELETE_ACTION_LABEL, icon: 'trash' },
  ];
}
