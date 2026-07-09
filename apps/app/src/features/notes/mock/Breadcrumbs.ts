import { Icons } from '@design-system/icons';

export const breadcrumbs = [
  {
    id: 'home',
    title: 'Notes',
    onClick: () => console.log('Notes'),
    icon: Icons.Tray,
  },

  {
    id: 'folder-1',
    title: 'Projects',
    onClick: () => console.log('Projects'),
    icon: Icons.Folder,
  },

  {
    id: 'folder-2',
    title: 'Clutter',
    onClick: () => console.log('Clutter'),
    icon: Icons.Folder,
  },

  {
    id: 'folder-3',
    title: 'Design System',
    onClick: () => console.log('Design System'),
    icon: Icons.Folder,
  },

  {
    id: 'note-1',
    title: 'Buttons',
    onClick: () => console.log('Buttons'),
    icon: Icons.Note,
  },
];
