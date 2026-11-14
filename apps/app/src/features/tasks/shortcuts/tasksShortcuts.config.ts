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
  // Handled locally by TasksShortcuts (opens the Options menu — Groups and
  // Display settings); never dispatched through NavigationRouter. The icon
  // registry has no sliders/tune icon, so this reuses 'settings'.
  { id: 'options', title: 'Options', icon: 'settings', disabled: false },
] as const satisfies readonly NavigationItem[];

export type TasksShortcutId = (typeof tasksShortcuts)[number]['id'];
