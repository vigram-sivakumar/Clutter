import type { ComponentType } from 'react';
import { CustomIcons } from '../../design-system/icons';

type NotesGroup = {
  title?: string;
  hasDivider?: boolean;
  collapsible?: boolean;
  items: {
    id: string;
    label: string;
    icon?: ComponentType;
  }[];
};

export const notesGroups: NotesGroup[] = [
  {
    title: 'Notes',
    hasDivider: true,
    items: [
      {
        id: 'all-notes',
        icon: CustomIcons.Note,
        label: 'All Notes',
      },
      {
        id: 'inbox',
        icon: CustomIcons.Tray,
        label: 'Inbox',
      },
      {
        id: 'templates',
        icon: CustomIcons.Template,
        label: 'My Templates',
      },
    ],
  },

  {
    title: 'Favorites',
    collapsible: true,
    items: [],
  },

  {
    title: 'Folders',
    collapsible: true,
    items: [],
  },
];
