import type { TopBarMenuItemConfig } from '@app/layouts/page/topbar/ResourceTopBarActions';
import type { FolderMetadata } from '@core/vault/models/FolderMetadata';

// 'move-to' is deliberately absent: folder-move has no destination-picker
// UI yet (the same deferred, not-impossible status as page 'move-to',
// removed from noteTopBarMenu.config.ts for the same reason — see
// ADR-013 and ADR-024's implementation-sequencing amendment). 'archive'
// (ADR-026) is status-dependent — shown only for an active folder; 'restore'
// is not implemented yet (ADR-026's implementation-sequencing amendment),
// so an already-archived folder shows neither, rather than a disabled
// 'restore' with no backing capability (rule 12). 'delete' is present
// (ADR-024) — unlike a page, this menu is only ever rendered for an
// ordinary folder (topBarRegistry dispatches a reserved folder to
// ReservedFolderTopBarActions instead, per MembershipSelector.isSystemFolder),
// so no disabled/reserved-folder guard is needed here. Rename isn't a menu
// item — it reuses the folder title's inline edit affordance directly,
// the same mechanism a page's title already has. No 'duplicate' item:
// folders are never duplicable — Duplicate is a Note-only capability.
export function buildFolderTopBarMenu(
  status: FolderMetadata['status']
): TopBarMenuItemConfig[] {
  const items: TopBarMenuItemConfig[] = [
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
  ];

  if (status !== 'archived') {
    items.push({ id: 'archive', label: 'Archive', icon: 'archive' });
  }

  items.push({ id: 'delete', label: 'Delete', icon: 'trash' });

  return items;
}
