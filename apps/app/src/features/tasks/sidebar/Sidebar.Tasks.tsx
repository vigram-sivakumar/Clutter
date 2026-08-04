import type { Vault } from '@core/vault/models';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { Workspace } from '@core/workspace/Workspace';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { buildTasksShortcutHandler } from '@features/tasks/shortcuts/buildTasksShortcutHandler';
import { TasksShortcuts } from '@features/tasks/shortcuts/TasksShortcuts';
import { renderTasksByDate } from '../helpers/renderTasksByDate';

interface TasksPanelProps {
  readonly vault: Vault;
  readonly navigation: NavigationRouter;
  readonly workspace: Workspace;
}

export function Tasks({ vault, navigation, workspace }: TasksPanelProps) {
  const tasks = [...vault.tasks()];
  const onShortcut = buildTasksShortcutHandler(navigation);

  return (
    <View navigation={<TasksShortcuts onShortcut={onShortcut} />}>
      {renderTasksByDate({ tasks, workspace })}
    </View>
  );
}
