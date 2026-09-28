import { PageBody } from '@app/layouts/page/body/Page.Body';
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import type { ResolveTag, ResolveWikiLink } from '@features/markdown/editor/MarkdownEditor';
import type { ResolvePageEmbed } from '@features/markdown/render/blocks/pageEmbedResolution';
import {
  renderTaskRow,
  renderTodayContent,
  renderUpcomingContent,
} from '../helpers/renderTasksByDate';
import { groupTasks, DEFAULT_TASK_DISPLAY_CONFIG, type TaskDisplayConfig } from '../helpers/groupTasks';
import { getCompletedTasks } from '../helpers/getCompletedTasks';

export type TasksCollectionView =
  | 'tasks-today'
  | 'tasks-upcoming'
  | 'tasks-completed'
  | 'tasks-all'
  | 'tasks-unscheduled';

// The Unscheduled collection view has never shown completed tasks (it
// predates the Show completed/Auto-sort completed preference) and isn't
// one of the two sections that preference targets (Today/Everything else)
// — a fixed config, not the shared Tasks-view `displayConfig` below, keeps
// its behavior exactly as it was.
const UNSCHEDULED_VIEW_CONFIG: TaskDisplayConfig = {
  showCompleted: false,
  autoSortCompleted: false,
};

export interface TasksCollectionBodyProps {
  readonly view: TasksCollectionView;
  readonly tasks: readonly TaskOccurrence[];
  readonly onToggleComplete: (task: TaskOccurrence) => void;
  readonly onOpenTask: (task: TaskOccurrence) => void;
  /**
   * The shared Tasks-view Show completed / Auto-sort completed preference
   * (see groupTasks.ts's TaskDisplayConfig) — applied to the tasks-today/
   * tasks-upcoming branches only, so the Today/Everything else collection
   * pages always render identically to their sidebar counterparts (see
   * this component's own doc comment). Defaults to
   * DEFAULT_TASK_DISPLAY_CONFIG for callers that don't need to exercise it.
   */
  readonly displayConfig?: TaskDisplayConfig;
  /** Same injected resolution boundary the page editor uses — see Note's own prop doc comment. */
  readonly resolveWikiLink?: ResolveWikiLink;
  readonly resolveTag?: ResolveTag;
  readonly resolveEmbed?: ResolvePageEmbed;
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
  onToggleComplete,
  onOpenTask,
  displayConfig = DEFAULT_TASK_DISPLAY_CONFIG,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
}: TasksCollectionBodyProps) {
  const rowCallbacks = { onToggleComplete, onOpenTask, resolveWikiLink, resolveTag, resolveEmbed };

  if (view === 'tasks-today') {
    const { today } = groupTasks(tasks, displayConfig);
    return (
      <PageBody>
        {renderTodayContent({
          today,
          onToggleComplete,
          onOpenTask,
          resolveWikiLink,
          resolveTag,
          resolveEmbed,
        })}
      </PageBody>
    );
  }

  if (view === 'tasks-upcoming') {
    const { upcoming } = groupTasks(tasks, displayConfig);
    return (
      <PageBody>
        {renderUpcomingContent({ upcoming, onToggleComplete, onOpenTask, resolveWikiLink, resolveTag, resolveEmbed })}
      </PageBody>
    );
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
        {groupTasks(tasks, UNSCHEDULED_VIEW_CONFIG).unscheduled.map((task) =>
          renderTaskRow(task, rowCallbacks)
        )}
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
