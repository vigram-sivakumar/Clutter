import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';
import type { NavigationItem } from '@app/layouts/sidebar/navigation/NavigationItem';

// 'create-task' no longer dispatches through onShortcut/NavigationRouter at
// all — TasksShortcuts intercepts its click locally to open a task-creation
// overlay (UI only, no backing capability yet; see TasksShortcuts.tsx).
// NavigationRouter.createTask() still throws (ADR-012/013/014's
// disposition) and must stay unreachable from this button until a real
// capability exists (see ADR-016's post-migration cleanup entry).
export const tasksShortcuts = [
  { id: 'create-task', title: 'New', icon: 'plus', disabled: false },
  {
    id: 'all-tasks',
    title: getSystemLocationPresentation('tasks-all').label,
    icon: getSystemLocationPresentation('tasks-all').icon,
    disabled: false,
  },
  {
    id: 'unscheduled',
    title: getSystemLocationPresentation('tasks-unscheduled').label,
    icon: getSystemLocationPresentation('tasks-unscheduled').icon,
    disabled: false,
  },
  // Handled locally by TasksShortcuts (opens the Options menu — Groups and
  // Display settings); never dispatched through NavigationRouter. The icon
  // registry has no sliders/tune icon, so this reuses 'settings'.
  { id: 'options', title: 'Options', icon: 'settings', disabled: false },
] as const satisfies readonly NavigationItem[];

export type TasksShortcutId = (typeof tasksShortcuts)[number]['id'];
