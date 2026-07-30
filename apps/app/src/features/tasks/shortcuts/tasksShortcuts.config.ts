export const tasksShortcuts = [
  { id: 'create-task', title: 'Create task', icon: 'plus' },
  { id: 'all-task', title: 'All task', icon: 'tray' },
  { id: 'someday', title: 'Someday', icon: 'calendar' },
  { id: 'completed', title: 'Completed', icon: 'squareCheckOutline' },
] as const;

export type TasksShortcutId = (typeof tasksShortcuts)[number]['id'];
