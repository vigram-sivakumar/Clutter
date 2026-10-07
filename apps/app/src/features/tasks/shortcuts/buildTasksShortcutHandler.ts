import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';

import type { TasksShortcutId } from './tasksShortcuts.config';

export function buildTasksShortcutHandler(
  navigation: NavigationRouter
): (id: TasksShortcutId) => void {
  return (id) => {
    switch (id) {
      case 'create-task':
        // Unreachable: TasksShortcuts intercepts this click itself to open
        // the task-creation overlay, never forwarding it to onShortcut.
        // Left here only so this switch stays exhaustive over
        // TasksShortcutId; still throws if that ever changes before
        // NavigationRouter.createTask() has a real capability behind it.
        navigation.createTask();
        break;
      case 'options':
        // Unreachable: TasksShortcuts opens the Options menu itself.
        break;
      case 'all-tasks':
        navigation.openAllTasks();
        break;
      case 'unscheduled':
        navigation.openTasksUnscheduled();
        break;
      default: {
        const _exhaustive: never = id;
        throw new Error(`Unknown tasks shortcut: ${_exhaustive}`);
      }
    }
  };
}
