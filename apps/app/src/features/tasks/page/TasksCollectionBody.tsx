import { PageBody } from '@app/layouts/page/body/Page.Body';
import type { TaskOccurrence as TaskModel } from '@core/vault/models/occurrences';
import type { Workspace } from '@core/workspace/Workspace';
import {
  renderTaskRow,
  renderTodayContent,
  renderUpcomingContent,
} from '../helpers/renderTasksByDate';
import { getCompletedTasks } from '../helpers/getCompletedTasks';

export type TasksCollectionView = 'tasks-today' | 'tasks-upcoming' | 'tasks-completed';

export interface TasksCollectionBodyProps {
  readonly view: TasksCollectionView;
  readonly tasks: readonly TaskModel[];
  readonly workspace: Workspace;
  readonly onToggleComplete: (task: TaskModel) => void;
  readonly onOpenCompleted: () => void;
}

/**
 * The page-body rendering for the three task collection views (Phase 2E).
 * Deliberately not a CollectionBody variant — CollectionEntryModel
 * (folder/note-shaped) has no room for `completed`/`dueDate`, so forcing
 * tasks through it would be exactly the mistake ADR-022 already rejected
 * for Workspace/Favorites, one layer over. Instead this composes the same
 * renderTodayContent/renderUpcomingContent/renderTaskRow functions the
 * sidebar already uses, so sidebar and page can never render tasks
 * differently.
 */
export function TasksCollectionBody({
  view,
  tasks,
  workspace,
  onToggleComplete,
  onOpenCompleted,
}: TasksCollectionBodyProps) {
  if (view === 'tasks-today') {
    return (
      <PageBody>
        {renderTodayContent({ tasks, workspace, onToggleComplete, onOpenCompleted })}
      </PageBody>
    );
  }

  if (view === 'tasks-upcoming') {
    return <PageBody>{renderUpcomingContent({ tasks, onToggleComplete })}</PageBody>;
  }

  return (
    <PageBody>
      {getCompletedTasks(tasks).map((task) => renderTaskRow(task, { onToggleComplete }))}
    </PageBody>
  );
}
