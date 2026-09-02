import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { ARCHIVE_ACTION_LABEL } from '@core/presentation/resourceActionLabels';

/**
 * The sidebar row's overflow menu for a VaultResource (image/pdf) —
 * mirrors noteSidebarMenu.config.ts's shape, pruned to exactly the
 * capabilities ResourceOperations backs today (Rename, Move, Archive). No
 * Favorite/Restore/Delete/Duplicate/Change-icon items: none of those have
 * a write path for a resource (Favorites is explicitly out of scope; the
 * others were never part of the approved Resource mutation design).
 *
 * `move-to`'s id/label/icon intentionally match Note/Folder's own
 * (noteSidebarMenu.config.ts/folderSidebarMenu.config.ts) — FolderTree's
 * onMenuSelect dispatch and Resource.tsx's MoveDestinationPicker wiring
 * key off this same 'move-to' id, exactly like Note/Folder's own rows do.
 *
 * Unlike buildNoteSidebarMenu/buildFolderSidebarMenu, this takes no
 * parameters — a resource has no draft state and no favorite flag to vary
 * the item set by, so the menu is always exactly these three items. Kept
 * as a function (not a plain constant) for the same call-site shape every
 * other row's menuItems prop already expects (`buildXSidebarMenu(...)`).
 */
export function buildResourceSidebarMenu(): OverflowMenuItemConfig[] {
  return [
    { id: 'rename', label: 'Rename', icon: 'notePencil', opensInlineEdit: true },
    { id: 'move-to', label: 'Move to…', icon: 'arrowDownRight' },
    { id: 'archive', label: ARCHIVE_ACTION_LABEL, icon: 'archive' },
  ];
}
