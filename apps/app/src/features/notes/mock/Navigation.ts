import type { NavigationItem } from '@shared/models/navigation-item';

export const notesNavigation: NavigationItem[] = [
  { id: 'new-note', title: 'New note', icon: 'notePencil' },
  {
    id: 'all-notes',
    title: 'All notes',
    icon: 'note',
  },
  { id: 'inbox', title: 'Unsorted', icon: 'tray' },
  { id: 'templates', title: 'Templates', icon: 'template' },
];
