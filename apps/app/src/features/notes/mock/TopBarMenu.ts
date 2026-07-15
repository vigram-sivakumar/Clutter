import { SystemIcon } from '@shared/icon';

export interface TopBarMenuItem {
  id: string;
  label: string;
  icon: SystemIcon;
}

export const topBarMenu: TopBarMenuItem[] = [
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
    id: 'archive',
    label: 'Archive',
    icon: 'archive',
  },
  {
    id: 'version-history',
    label: 'Version history',
    icon: 'clock',
  },
];
