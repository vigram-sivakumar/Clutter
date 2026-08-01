import type { TopBarMenuItemConfig } from '@app/layouts/page/topbar/ResourceTopBarActions';

// 'archive' and 'move-to' are deliberately absent: FolderOperations has no
// archive concept in the frozen spec at all (a permanent impossibility,
// not a deferred one), and folder-move has no destination-picker UI yet
// (the same deferred, not-impossible status as page 'move-to', removed
// from noteTopBarMenu.config.ts for the same reason). See ADR-013.
export const folderTopBarMenu: TopBarMenuItemConfig[] = [
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
