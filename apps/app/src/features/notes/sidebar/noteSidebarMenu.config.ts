import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import {
  ARCHIVE_ACTION_LABEL,
  DELETE_ACTION_LABEL,
  FAVORITE_ACTION_LABEL,
  UNFAVORITE_ACTION_LABEL,
} from '@core/presentation/resourceActionLabels';

/**
 * The sidebar row's overflow menu is deliberately narrower than
 * noteTopBarMenu.config.ts's topbar menu (no "Add a description",
 * "Version history") — scoped to exactly the capabilities PageOperations
 * already backs for a Note: rename, duplicate (ADR-028), favorite/
 * unfavorite (PageOperations.updateMetadata({ favorite }) — same call and
 * `toggle-favorite` id the topbar's favorite control uses), archive,
 * delete.
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
 * is needed the way the topbar menu needs one (this sidebar row never
 * renders for an archived Note either — an archived page is relocated
 * into Archive/ at archive time, outside the Workspace tree FolderTree
 * renders, so 'move-to' needs no archived-guard here beyond the Gate's
 * own).
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
    { id: 'archive', label: ARCHIVE_ACTION_LABEL, icon: 'archive' },
    { id: 'delete', label: DELETE_ACTION_LABEL, icon: 'trash' },
  ];
}
