import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';
import type { NavigationItem } from '@app/layouts/sidebar/navigation/NavigationItem';

// New opens the shared task dialog, which uses the configured destination.
// It never dispatches through NavigationRouter's legacy createTask stub.
export const tasksShortcuts = [
  { id: 'create-task', title: 'New', icon: 'plus', disabled: false },
  { id: 'inbox', title: 'Inbox', icon: getSystemLocationPresentation('inbox').icon, disabled: false },
  {
    id: 'all-tasks',
    title: getSystemLocationPresentation('tasks-all').label,
    icon: getSystemLocationPresentation('tasks-all').icon,
    disabled: false,
  },
] as const satisfies readonly NavigationItem[];

export type TasksShortcutId = (typeof tasksShortcuts)[number]['id'];
