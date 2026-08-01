export const tasksShortcuts = [
  { id: 'create-task', title: 'Create task', icon: 'plus' },
] as const;

export type TasksShortcutId = (typeof tasksShortcuts)[number]['id'];
