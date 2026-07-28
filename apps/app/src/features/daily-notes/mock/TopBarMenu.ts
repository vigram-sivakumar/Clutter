import { SystemIcon } from '@shared/icon';

export interface TopBarMenuItem {
  id: string;
  label: string;
  icon: SystemIcon;
}

export const topBarMenu: TopBarMenuItem[] = [
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
