import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { ARCHIVE_ACTION_LABEL, DELETE_ACTION_LABEL } from '@core/presentation/resourceActionLabels';

/**
 * Same action-building pattern as noteSidebarMenu.config.ts's
 * buildNoteSidebarMenu — capability-driven, only ever listing what's
 * actually available. A draft (no Vault entry yet) gets no menu items:
 * archive/delete require persistence, and — unlike a draft Note — rename
 * isn't offered for a draft Daily Note either, matching the persisted
 * branch's own restriction (dailyNoteTopBarMenu.config.ts has no Rename
 * item at all, since a Daily Note's title is its permanent, date-derived
 * calendar identity per PageHost's isRenameable guard). OverflowMenu
 * itself renders nothing when given an empty item list.
 */
export function buildDailyNoteSidebarMenu(isDraft: boolean): OverflowMenuItemConfig[] {
  if (isDraft) {
    return [];
  }

  return [
    { id: 'archive', label: ARCHIVE_ACTION_LABEL, icon: 'archive' },
    { id: 'delete', label: DELETE_ACTION_LABEL, icon: 'trash' },
  ];
}
