import type { TopBarMenuItemConfig } from '@app/layouts/page/topbar/ResourceTopBarActions';

export const dailyNoteTopBarMenu: TopBarMenuItemConfig[] = [
  {
    id: 'add-a-description',
    label: 'Add a description',
    icon: 'description',
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
