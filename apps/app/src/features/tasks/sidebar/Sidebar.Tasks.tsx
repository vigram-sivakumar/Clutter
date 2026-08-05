import type { Vault } from '@core/vault/models';
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { TaskOperations } from '@core/application/task/TaskOperations';
import type { Workspace } from '@core/workspace/Workspace';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { buildTasksShortcutHandler } from '@features/tasks/shortcuts/buildTasksShortcutHandler';
import { TasksShortcuts } from '@features/tasks/shortcuts/TasksShortcuts';
import { renderTasksByDate } from '../helpers/renderTasksByDate';

interface TasksPanelProps {
  readonly vault: Vault;
  readonly navigation: NavigationRouter;
  readonly workspace: Workspace;
  readonly taskOperations: TaskOperations;
  readonly pageOperations: PageOperations;
}

export function Tasks({
  vault,
  navigation,
  workspace,
  taskOperations,
  pageOperations,
}: TasksPanelProps) {
  const tasks = [...vault.tasks()];
  const onShortcut = buildTasksShortcutHandler(navigation);

  // Fire-and-forget, same as PageHost's onUpdateDescription/onArchive calls
  // into PageOperations — the UI reacts to the Vault's own notify() once
  // the Gate's rebuild lands (via AppLayout's single useVault() subscription),
  // never to this call's return value.
  const onToggleComplete = (task: TaskOccurrence): void => {
    void taskOperations.toggleComplete(task);
  };

  // Clicking a task opens its source note — the same PageOperations.open()
  // every other sidebar entry (FolderTree, DailyNotesList) already uses,
  // via the sourcePageId every TaskOccurrence already carries.
  const onOpenTask = (task: TaskOccurrence): void => {
    void pageOperations.open(task.sourcePageId);
  };

  return (
    <View navigation={<TasksShortcuts onShortcut={onShortcut} />}>
      {renderTasksByDate({
        tasks,
        workspace,
        onToggleComplete,
        onOpenTask,
        navigation,
      })}
    </View>
  );
}
