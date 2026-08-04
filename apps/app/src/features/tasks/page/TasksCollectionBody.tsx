import { PageBody } from '@app/layouts/page/body/Page.Body';
import type { TaskOccurrence as TaskModel } from '@core/vault/models/occurrences';
import type { Workspace } from '@core/workspace/Workspace';
import {
  renderTaskRow,
  renderTodayContent,
  renderUpcomingContent,
} from '../helpers/renderTasksByDate';
import { groupTasks } from '../helpers/groupTasks';
import { getCompletedTasks } from '../helpers/getCompletedTasks';

export type TasksCollectionView =
  | 'tasks-today'
  | 'tasks-upcoming'
  | 'tasks-completed'
  | 'tasks-all'
  | 'tasks-unscheduled';

export interface TasksCollectionBodyProps {
  readonly view: TasksCollectionView;
  readonly tasks: readonly TaskModel[];
  readonly workspace: Workspace;
  readonly onToggleComplete: (task: TaskModel) => void;
  readonly onOpenTask: (task: TaskModel) => void;
  readonly onOpenCompleted: () => void;
}

/**
 * The page-body rendering for every task collection view. Deliberately
 * not a CollectionBody variant — CollectionEntryModel (folder/note-shaped)
 * has no room for `completed`/`dueDate`, so forcing tasks through it would
 * be exactly the mistake ADR-022 already rejected for Workspace/Favorites,
 * one layer over. Instead this composes the same renderTodayContent/
 * renderUpcomingContent/renderTaskRow/groupTasks/getCompletedTasks the
 * sidebar already uses, so sidebar and page can never render tasks
 * differently.
 */
export function TasksCollectionBody({
  view,
  tasks,
  workspace,
  onToggleComplete,
  onOpenTask,
  onOpenCompleted,
}: TasksCollectionBodyProps) {
  const rowCallbacks = { onToggleComplete, onOpenTask };

  if (view === 'tasks-today') {
    return (
      <PageBody>
        {renderTodayContent({ tasks, workspace, onToggleComplete, onOpenTask, onOpenCompleted })}
      </PageBody>
    );
  }

  if (view === 'tasks-upcoming') {
    return <PageBody>{renderUpcomingContent({ tasks, onToggleComplete, onOpenTask })}</PageBody>;
  }

  if (view === 'tasks-completed') {
    return (
      <PageBody>
        {getCompletedTasks(tasks).map((task) => renderTaskRow(task, rowCallbacks))}
      </PageBody>
    );
  }

  if (view === 'tasks-unscheduled') {
    return (
      <PageBody>
        {groupTasks(tasks).unscheduled.map((task) => renderTaskRow(task, rowCallbacks))}
      </PageBody>
    );
  }

  // tasks-all — every task, incomplete first (natural order), then
  // completed (newest-completed-first via getCompletedTasks) — reuses
  // the same two building blocks rather than inventing a third ordering.
  const incomplete = tasks.filter((task) => !task.completed);

  return (
    <PageBody>
      {[...incomplete, ...getCompletedTasks(tasks)].map((task) =>
        renderTaskRow(task, rowCallbacks)
      )}
    </PageBody>
  );
}
