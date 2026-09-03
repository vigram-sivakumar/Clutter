import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { ARCHIVE_ACTION_LABEL } from '@core/presentation/resourceActionLabels';
import { buildLocationActionMenuItems } from '@core/presentation/getLocationPathRepresentations';

/**
 * Same action-building pattern as noteSidebarMenu.config.ts's
 * buildNoteSidebarMenu — capability-driven, only ever listing what's
 * actually available. A draft (no Vault entry yet) gets no menu items:
 * archive requires persistence, and — unlike a draft Note —
 * rename isn't offered for a draft Daily Note either, matching the
 * persisted branch's own restriction (dailyNoteTopBarMenu.config.ts has no
 * Rename item at all, since a Daily Note's title is its permanent,
 * date-derived calendar identity per PageHost's isRenameable guard).
 * OverflowMenu itself renders nothing when given an empty item list.
 *
 * No 'delete' item: same unconditional-absence treatment as
 * noteSidebarMenu.config.ts/folderSidebarMenu.config.ts — the deletion-UX
 * product decision withdraws permanent Delete from every ordinary
 * workspace resource, and this row never renders an archived Daily Note
 * (same MembershipSelector.isEffectivelyArchived exclusion). Delete
 * remains reachable only from the topbar, for an archived/Archive-
 * descendant Daily Note.
 *
 * No favorite item: Daily Notes deliberately do not support favoriting
 * (unlike Note/Folder) — see noteSidebarMenu.config.ts/folderSidebarMenu.config.ts
 * for that capability.
 */
export function buildDailyNoteSidebarMenu(isDraft: boolean): OverflowMenuItemConfig[] {
  if (isDraft) {
    return [];
  }

  return [
    // 'page' — a Daily Note is a Page (Vault.resolvePageType), same as an
    // ordinary Note; see getLocationPathRepresentations.ts's
    // LocationEntityKind.
    ...buildLocationActionMenuItems('page'),
    { id: 'archive', label: ARCHIVE_ACTION_LABEL, icon: 'archive' },
  ];
}
