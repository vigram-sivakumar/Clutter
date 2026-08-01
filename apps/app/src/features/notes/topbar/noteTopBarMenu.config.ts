import type { TopBarMenuItemConfig } from '@app/layouts/page/topbar/ResourceTopBarActions';

export const noteTopBarMenu: TopBarMenuItemConfig[] = [
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
    id: 'move-to',
    label: 'Move to…',
    icon: 'arrowDownRight',
  },
  {
    id: 'add-to-favorite',
    label: 'Add to favorite',
    icon: 'favouriteOutline',
  },
  {
    id: 'version-history',
    label: 'Version history',
    icon: 'clock',
  },
  {
    id: 'archive',
    label: 'Archive',
    icon: 'archive',
  },
];
