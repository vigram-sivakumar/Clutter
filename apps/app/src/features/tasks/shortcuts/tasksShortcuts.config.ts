import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';
import type { NavigationItem } from '@app/layouts/sidebar/navigation/NavigationItem';

// 'create-task' is rendered disabled: NavigationRouter.createTask() throws
// (ADR-012/013/014's disposition — creating a *new* task has no backing
// capability yet, distinct from TaskOperations' existing mutations on
// already-extracted tasks). Kept visible rather than removed, same as
// Controls' placeholders, so the affordance isn't lost entirely — but it
// must never be clickable while it can only throw (see ADR-016's
// post-migration cleanup entry).
export const tasksShortcuts = [
  { id: 'create-task', title: 'New', icon: 'plus', disabled: true },
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
  {
    id: 'completed',
    title: getSystemLocationPresentation('tasks-completed').label,
    icon: getSystemLocationPresentation('tasks-completed').icon,
    disabled: false,
  },
] as const satisfies readonly NavigationItem[];

export type TasksShortcutId = (typeof tasksShortcuts)[number]['id'];
