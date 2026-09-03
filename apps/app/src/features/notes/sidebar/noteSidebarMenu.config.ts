import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import {
  ARCHIVE_ACTION_LABEL,
  FAVORITE_ACTION_LABEL,
  UNFAVORITE_ACTION_LABEL,
} from '@core/presentation/resourceActionLabels';
import { buildLocationActionMenuItems } from '@core/presentation/getLocationPathRepresentations';

/**
 * The sidebar row's overflow menu is deliberately narrower than
 * noteTopBarMenu.config.ts's topbar menu (no "Add a description",
 * "Version history") — scoped to exactly the capabilities PageOperations
 * already backs for a Note: rename, duplicate (ADR-028), favorite/
 * unfavorite (PageOperations.updateMetadata({ favorite }) — same call and
 * `toggle-favorite` id the topbar's favorite control uses), archive.
 *
 * No 'delete' item: the deletion-UX product decision withdraws permanent
 * Delete from every ordinary workspace resource (Archive is its removal
 * action instead), and this row never renders an archived Note in the
 * first place — an archived page is relocated into Archive/ at archive
 * time, outside the Workspace tree FolderTree renders (MembershipSelector.
 * isEffectivelyArchived already excludes it from every child-page query
 * this sidebar reads). So unlike the topbar menu, which still reaches an
 * archived resource and gates 'delete' on that state, this sidebar menu
 * needs no isDeletable parameter at all — it is unconditionally absent.
 *
 * A draft (no Vault entry yet) gets no menu items at all — capability-
 * driven, not disabled-and-shown (ADR-017 Decision item 9's "disabled,
 * not omitted" convention governs the topbar menu specifically, not this
 * sidebar surface). OverflowMenu itself renders nothing when given an
 * empty item list, so a draft row's overflow button simply doesn't
 * appear. Duplicate and favorite are unavailable for a draft for the same
 * reason — there is nothing on disk yet to copy or persist a favorite
 * flag against. 'move-to' is unavailable for the same reason too — the
 * draft-omitted branch already covers it, so no separate disabled state
 * is needed the way the topbar menu needs one.
 */
export function buildNoteSidebarMenu(
  isDraft: boolean,
  isFavorite: boolean = false
): OverflowMenuItemConfig[] {
  if (isDraft) {
    return [];
  }

  return [
    { id: 'rename', label: 'Rename', icon: 'notePencil', opensInlineEdit: true },
    { id: 'change-icon', label: 'Change icon', icon: 'smile' },
    { id: 'duplicate', label: 'Duplicate', icon: 'copy' },
    { id: 'move-to', label: 'Move to…', icon: 'arrowDownRight' },
    {
      id: 'toggle-favorite',
      label: isFavorite ? UNFAVORITE_ACTION_LABEL : FAVORITE_ACTION_LABEL,
      icon: isFavorite ? 'favouriteFilled' : 'favouriteOutline',
    },
    // 'page' — a Note is a Page (Vault.resolvePageType), same as Daily
    // Note; see getLocationPathRepresentations.ts's LocationEntityKind.
    ...buildLocationActionMenuItems('page'),
    { id: 'archive', label: ARCHIVE_ACTION_LABEL, icon: 'archive' },
  ];
}
