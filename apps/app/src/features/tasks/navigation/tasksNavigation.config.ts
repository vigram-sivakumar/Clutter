import type { NavigationItem } from '@shared/models/NavigationItem';

export const tasksNavigation: NavigationItem[] = [
  { id: 'create-task', title: 'Create task', icon: 'plus' },
  { id: 'all-task', title: 'All task', icon: 'tray' },
  { id: 'someday', title: 'Someday', icon: 'calendar' },
  { id: 'completed', title: 'Completed', icon: 'squareCheckOutline' },
];
