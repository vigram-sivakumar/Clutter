import { PageBody } from '@app/layouts/page/body/Page.Body';
import type { TaskOccurrence as TaskModel } from '@core/vault/models/occurrences';
import type { Workspace } from '@core/workspace/Workspace';
import { renderTodayContent, renderUpcomingContent } from '../helpers/renderTasksByDate';

export type TasksCollectionView = 'tasks-today' | 'tasks-upcoming';

export interface TasksCollectionBodyProps {
  readonly view: TasksCollectionView;
  readonly tasks: readonly TaskModel[];
  readonly workspace: Workspace;
  readonly onToggleComplete: (task: TaskModel) => void;
}

/**
 * The page-body rendering for the Today/Upcoming task collection views.
 * Deliberately not a CollectionBody variant — CollectionEntryModel
 * (folder/note-shaped) has no room for `completed`/`dueDate`, so forcing
 * tasks through it would be exactly the mistake ADR-022 already rejected
 * for Workspace/Favorites, one layer over. Instead this composes the same
 * renderTodayContent/renderUpcomingContent functions the sidebar already
 * uses, so sidebar and page can never render tasks differently.
 */
export function TasksCollectionBody({
  view,
  tasks,
  workspace,
  onToggleComplete,
}: TasksCollectionBodyProps) {
  if (view === 'tasks-today') {
    return <PageBody>{renderTodayContent({ tasks, workspace, onToggleComplete })}</PageBody>;
  }

  return <PageBody>{renderUpcomingContent({ tasks, onToggleComplete })}</PageBody>;
}
