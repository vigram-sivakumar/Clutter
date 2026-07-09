import type { BreadcrumbProps } from '@components/breadcrumb/Breadcrumb';

export const breadcrumbs: BreadcrumbProps[] = [
  {
    id: 'inbox',
    title: 'Inbox',
    icon: 'tray',
    onClick: () => console.log('Notes'),
  },
  {
    id: 'personal',
    title: 'Personal',
    icon: 'folder',
    emoji: '🏠',
    onClick: () => console.log('Personal'),
  },
  {
    id: 'travel',
    title: 'Travel',
    icon: 'folder',
    emoji: '✈️',
    onClick: () => console.log('Travel'),
  },
  {
    id: 'japan-trip',
    title: 'Japan Trip',
    icon: 'folder',
    onClick: () => console.log('Japan Trip'),
  },
  {
    id: 'packing-list',
    title: 'Packing List',
    icon: 'note',
    emoji: '🎒',
    onClick: () => console.log('Packing List'),
  },
];
