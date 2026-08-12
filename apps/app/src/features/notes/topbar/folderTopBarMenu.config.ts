import type { TopBarMenuItemConfig } from '@app/layouts/page/topbar/ResourceTopBarActions';
import type { FolderMetadata } from '@core/vault/models/FolderMetadata';
import { ARCHIVE_ACTION_LABEL, DELETE_ACTION_LABEL } from '@core/presentation/resourceActionLabels';

// 'move-to' is deliberately absent: folder-move has no destination-picker
// UI yet (the same deferred, not-impossible status as page 'move-to',
// removed from noteTopBarMenu.config.ts for the same reason — see
// ADR-013 and ADR-024's implementation-sequencing amendment). Archive/
// Restore (ADR-026) is a status-dependent toggle, mirroring
// buildNoteTopBarMenu's identical shape one aggregate over: a folder is
// only ever active or archived, never both, so the menu shows exactly one
// of the two. 'delete' is present (ADR-024) — unlike a page, this menu is
// only ever rendered for an ordinary folder (topBarRegistry dispatches a
// reserved folder to ReservedFolderTopBarActions instead, per
// MembershipSelector.isSystemFolder), so no disabled/reserved-folder guard
// is needed here. Rename isn't a menu item — it reuses the folder title's
// inline edit affordance directly, the same mechanism a page's title
// already has. No 'duplicate' item: folders are never duplicable —
// Duplicate is a Note-only capability.
export function buildFolderTopBarMenu(
  status: FolderMetadata['status']
): TopBarMenuItemConfig[] {
  return [
    {
      id: 'add-a-description',
      label: 'Add a description',
      icon: 'description',
    },
    {
      id: 'add-to-favorite',
      label: 'Add to favorite',
      icon: 'favouriteOutline',
    },
    status === 'archived'
      ? { id: 'restore', label: 'Restore', icon: 'restore' }
      : { id: 'archive', label: ARCHIVE_ACTION_LABEL, icon: 'archive' },
    { id: 'delete', label: DELETE_ACTION_LABEL, icon: 'trash' },
  ];
}
