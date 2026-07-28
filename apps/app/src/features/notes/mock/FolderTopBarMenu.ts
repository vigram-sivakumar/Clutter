import { SystemIcon } from '@shared/icon';

export interface FolderTopBarMenuItem {
  id: string;
  label: string;
  icon: SystemIcon;
}

export const folderTopBarMenu: FolderTopBarMenuItem[] = [
  {
    id: 'add-a-description',
    label: 'Add a description',
    icon: 'description',
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
];
