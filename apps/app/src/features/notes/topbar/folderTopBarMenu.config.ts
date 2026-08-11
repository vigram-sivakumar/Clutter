import type { TopBarMenuItemConfig } from '@app/layouts/page/topbar/ResourceTopBarActions';

// 'archive' and 'move-to' are deliberately absent: FolderOperations has no
// archive concept in the frozen spec at all (a permanent impossibility,
// not a deferred one, confirmed independently by ADR-024's audit), and
// folder-move has no destination-picker UI yet (the same deferred,
// not-impossible status as page 'move-to', removed from
// noteTopBarMenu.config.ts for the same reason — see ADR-013 and
// ADR-024's implementation-sequencing amendment). 'delete' is present
// (ADR-024) — unlike a page, this menu is only ever rendered for an
// ordinary folder (topBarRegistry dispatches a reserved folder to
// ReservedFolderTopBarActions instead, per MembershipSelector.isSystemFolder),
// so no disabled/reserved-folder guard is needed here. Rename isn't a menu
// item — it reuses the folder title's inline edit affordance directly,
// the same mechanism a page's title already has. 'duplicate' (ADR-028)
// mirrors noteTopBarMenu.config.ts's item of the same id.
export const folderTopBarMenu: TopBarMenuItemConfig[] = [
  {
    id: 'add-a-description',
    label: 'Add a description',
    icon: 'description',
  },
  {
    id: 'duplicate',
    label: 'Duplicate',
    icon: 'copy',
  },
  {
    id: 'add-to-favorite',
    label: 'Add to favorite',
    icon: 'favouriteOutline',
  },
  {
    id: 'delete',
    label: 'Delete',
    icon: 'trash',
  },
];
