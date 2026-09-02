import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import type { FolderMetadata } from '@core/vault/models/FolderMetadata';
import {
  ARCHIVE_ACTION_LABEL,
  FAVORITE_ACTION_LABEL,
  UNFAVORITE_ACTION_LABEL,
} from '@core/presentation/resourceActionLabels';

/**
 * 'archive' is status-dependent (ADR-026): shown for an active folder,
 * omitted for an already-archived one — an archived folder is never
 * reachable through this menu in the first place (FolderTree only ever
 * renders active Workspace folders; an archived folder lives in Archive/,
 * outside this tree), so there is no 'restore' item to show in its place
 * here. Restore is implemented (FolderOperations.restore(), same as
 * Note/Daily Note) and reachable via the topbar, the sole restore entry
 * point for all three archivable types today — none of them expose restore
 * from a sidebar row menu. The sidebar menu is otherwise capability-driven,
 * not resource-type-driven: it shows exactly what FolderOperations backs
 * today (rename, archive), not a parity-shaped placeholder. Folders
 * are never duplicable — Duplicate is a Note-only capability. Every folder
 * FolderTree renders is already non-reserved
 * (MembershipSelector.getWorkspaceFolders/query.getChildFolders never
 * surface a system folder here), so no reserved-folder guard is needed.
 * 'move-to' is unconditional for the same reason 'archive' is only
 * conditionally omitted rather than disabled — an archived folder is
 * never reachable through this menu at all, so 'move-to' needs no
 * archived-guard here beyond the Gate's own.
 *
 * No 'delete' item, for the same reason and the same "unconditionally
 * absent, not gated" treatment as noteSidebarMenu.config.ts — see its doc
 * comment. Permanent Delete now lives only in the topbar, restricted to a
 * resource that is archived or an Archive descendant, neither of which
 * this menu ever renders.
 *
 * 'toggle-favorite' now backs FolderOperations.updateMetadata({ favorite }),
 * the same id and shared-operation pattern the topbar's folder favorite
 * control and every Note/Daily Note favorite entry point use — one
 * capability, one Gate kind ('update-folder-metadata'), several UI entry
 * points into the same call.
 */
export function buildFolderSidebarMenu(
  status: FolderMetadata['status'],
  isFavorite: boolean = false
): OverflowMenuItemConfig[] {
  const items: OverflowMenuItemConfig[] = [
    { id: 'rename', label: 'Rename', icon: 'notePencil', opensInlineEdit: true },
    { id: 'change-icon', label: 'Change icon', icon: 'smile' },
    { id: 'move-to', label: 'Move to…', icon: 'arrowDownRight' },
    {
      id: 'toggle-favorite',
      label: isFavorite ? UNFAVORITE_ACTION_LABEL : FAVORITE_ACTION_LABEL,
      icon: isFavorite ? 'favouriteFilled' : 'favouriteOutline',
    },
  ];

  if (status !== 'archived') {
    items.push({ id: 'archive', label: ARCHIVE_ACTION_LABEL, icon: 'archive' });
  }

  return items;
}
