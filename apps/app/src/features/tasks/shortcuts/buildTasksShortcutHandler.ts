import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';

import type { TasksShortcutId } from './tasksShortcuts.config';

export function buildTasksShortcutHandler(
  navigation: NavigationRouter
): (id: TasksShortcutId) => void {
  return (id) => {
    switch (id) {
      case 'create-task':
        navigation.createTask();
        break;
      case 'all-task':
        navigation.openAllTasks();
        break;
      case 'someday':
        navigation.openSomedayTasks();
        break;
      case 'completed':
        navigation.openCompletedTasks();
        break;
      default: {
        const _exhaustive: never = id;
        throw new Error(`Unknown tasks shortcut: ${_exhaustive}`);
      }
    }
  };
}
