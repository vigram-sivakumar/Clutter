import type { TopBarMenuItemConfig } from '@app/layouts/page/topbar/ResourceTopBarActions';
import { DELETE_ACTION_LABEL, ARCHIVE_ACTION_LABEL } from '@core/presentation/resourceActionLabels';

/**
 * The Image/PDF Resource Page's More Actions menu — mirrors
 * resourceSidebarMenu.config.ts's buildResourceSidebarMenu (Rename/Move
 * to…/Archive) for a resource that isn't archived, and mirrors
 * buildNoteTopBarMenu/buildFolderTopBarMenu's archived branch (Restore,
 * plus Delete when reachable — always true here, since Delete is only
 * ever reachable for an archived resource in the first place, per the
 * deletion-UX product decision every other resource type already
 * follows) for one that is.
 *
 * `rename` has no `opensInlineEdit` flag here (unlike the sidebar row's
 * identical item) — there is no inline row on this page to switch into
 * edit mode; the caller opens RenameResourceDialog instead.
 */
export function buildResourceTopBarMenu(isArchived: boolean): TopBarMenuItemConfig[] {
  if (isArchived) {
    return [
      { id: 'restore', label: 'Restore', icon: 'restore' },
      { id: 'delete', label: DELETE_ACTION_LABEL, icon: 'trash' },
    ];
  }

  return [
    { id: 'rename', label: 'Rename', icon: 'notePencil' },
    { id: 'move-to', label: 'Move to…', icon: 'arrowDownRight' },
    { id: 'archive', label: ARCHIVE_ACTION_LABEL, icon: 'archive' },
  ];
}
