import type { SystemIcon } from '@shared/icon';

export interface DailyNoteTopBarMenuItem {
  id: string;
  label: string;
  icon: SystemIcon;
}

export const dailyNoteTopBarMenu: DailyNoteTopBarMenuItem[] = [
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
