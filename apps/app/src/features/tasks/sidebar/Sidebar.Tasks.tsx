import type { Vault } from '@core/vault/models';
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { TaskOperations } from '@core/application/task/TaskOperations';
import type { Workspace } from '@core/workspace/Workspace';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { buildTasksShortcutHandler } from '@features/tasks/shortcuts/buildTasksShortcutHandler';
import { TasksShortcuts } from '@features/tasks/shortcuts/TasksShortcuts';
import { createTagResolver } from '@app/layouts/page/resolveTag';
import { createWikiLinkResolver } from '@app/layouts/page/resolveWikiLink';
import { renderTasksByDate } from '../helpers/renderTasksByDate';

interface TasksPanelProps {
  readonly vault: Vault;
  readonly navigation: NavigationRouter;
  readonly workspace: Workspace;
  readonly taskOperations: TaskOperations;
  readonly pageOperations: PageOperations;
  readonly folderOperations: FolderOperations;
}

export function Tasks({
  vault,
  navigation,
  workspace,
  taskOperations,
  pageOperations,
  folderOperations,
}: TasksPanelProps) {
  const tasks = [...vault.tasks()];
  const onShortcut = buildTasksShortcutHandler(navigation);

  // Same composition PageHost.tsx/Sidebar.Notes.tsx/Sidebar.DailyNotes.tsx
  // use to inject the page editor's own WikiLink/Tag resolution — cheap,
  // stateless glue, not worth memoizing (resolveTag.ts/resolveWikiLink.ts).
  const resolveWikiLink = createWikiLinkResolver(vault, pageOperations, folderOperations);
  const resolveTag = createTagResolver(navigation, vault);

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
        resolveWikiLink,
        resolveTag,
      })}
    </View>
  );
}
