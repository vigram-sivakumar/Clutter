import type { ReactNode } from 'react';
import { PageBody } from '@app/layouts/page/body/Page.Body';
import { CollectionEmptyState } from '@features/collection/components/empty/CollectionEmptyState';
import { CollectionDataList } from '@features/collection/components/list/CollectionDataList';
import { CollectionDataTable } from '@features/collection/components/table/CollectionDataTable';
import { buildPropertyTableColumns, propertyValueCells } from '@features/collection/properties/tableColumns';
import { AppIcon } from '@shared/icon';
import { TaskDueDateButton } from './TaskDueDateButton';
import { Checkbox } from '@components/checkbox/Checkbox';
import { renderCompactMarkdown } from '@features/markdown/render/renderCompactMarkdown';
import { formatTaskTitle } from '../helpers/formatTaskTitle';
import { taskPropertyValues } from '../helpers/taskPropertyValues';
import { sortEntries } from '@core/properties/collectionSort';
import type { PropertyValues } from '@core/properties/collectionProperties';
import { resolveCollectionView, type ResolvedCollectionView } from '@core/presentation/collection/resolveCollectionView';
import { TASKS_COLLECTION } from '@core/presentation/collection/collectionDefinitions';
import '../sidebar/Task.css';
import { CollectionRowList } from '@app/layouts/page/body/CollectionRowList';
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import type { ResolveTag, ResolveWikiLink } from '@features/markdown/editor/MarkdownEditor';
import type { ResolvePageEmbed } from '@features/markdown/render/blocks/pageEmbedResolution';
import {
  renderTaskRow,
  renderTodayContent,
  renderOverdueContent,
  renderUpcomingContent,
} from '../helpers/renderTasksByDate';
import { groupTasks, DEFAULT_TASK_DISPLAY_CONFIG, type TaskDisplayConfig } from '../helpers/groupTasks';
import { getCompletedTasks } from '../helpers/getCompletedTasks';

export type TasksCollectionView =
  | 'tasks-today'
  | 'tasks-overdue'
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

/** The note a task lives in, as the wiki-link-style link the row shows: its label and its own identity icon/emoji. */
export interface TaskSourceLink {
  readonly label: string;
  readonly icon: 'note' | 'calendarNote' | 'calendarDot' | 'template';
  readonly emoji: string | null;
}

/** One All Tasks row's worth of data: the task, where it lives, and its raw property values (what the shared sort engine and layouts read). */
interface TaskEntry {
  readonly id: string;
  readonly task: TaskOccurrence;
  readonly source: TaskSourceLink | undefined;
  readonly values: PropertyValues;
}

export interface TasksCollectionBodyProps {
  readonly view: TasksCollectionView;
  readonly tasks: readonly TaskOccurrence[];
  readonly onToggleComplete: (task: TaskOccurrence) => void;
  readonly onOpenTask: (task: TaskOccurrence) => void;
  /** Opens a row's Change due date calendar; a date string sets it, null clears it — never moves the task. */
  readonly onChangeDueDate: (task: TaskOccurrence, date: string | null) => void;
  /** Inserts an exact copy of a row's task directly below the original in its source note. */
  readonly onDuplicateTask: (task: TaskOccurrence) => void;
  /** Deletes a row's task from its source note. */
  readonly onDeleteTask: (task: TaskOccurrence) => void;
  /**
   * The shared Tasks-view Show completed / Auto-sort completed preference
   * (see groupTasks.ts's TaskDisplayConfig) — applied to the tasks-today/
   * tasks-upcoming branches only, so the Today/Upcoming collection pages
   * always render identically to their sidebar counterparts (see this
   * component's own doc comment). The tasks-overdue branch reads `overdue`
   * from the same `groupTasks` call, but that group is never affected by
   * either preference (see groupTasks.ts's `overdue` doc comment) — passing
   * `displayConfig` through is just for a single consistent call shape, not
   * because it changes Overdue's membership or ordering. Defaults to
   * DEFAULT_TASK_DISPLAY_CONFIG for callers that don't need to exercise it.
   */
  readonly displayConfig?: TaskDisplayConfig;
  /**
   * The tasks-all page's resolved Configure state (layout, visible properties, sort) — the same
   * `resolveCollectionView` result every collection page draws from. Absent: the collection's defaults.
   */
  readonly collectionView?: ResolvedCollectionView;
  /** The note a task lives in (shown as a wiki-link-style link that opens it); absent or undefined hides the link. */
  readonly getSource?: (task: TaskOccurrence) => TaskSourceLink | undefined;
  /** Same injected resolution boundary the page editor uses — see Note's own prop doc comment. */
  readonly resolveWikiLink?: ResolveWikiLink;
  readonly resolveTag?: ResolveTag;
  readonly resolveEmbed?: ResolvePageEmbed;
}

/**
 * The one page-body wrapper every task view renders through: the standard
 * collection `PageBody` plus the shared `collection__bottom-spacer` every
 * collection body must end with (see CollectionBody.css) — the trailing
 * scroll space that lets the last row scroll clear of the page's bottom
 * fade. Defined once here so no individual view can forget it.
 */
function TasksPageBody({ children }: { readonly children: ReactNode }) {
  return (
    <PageBody className="collection__content">
      {children}
      <div className="collection__bottom-spacer" aria-hidden="true" />
    </PageBody>
  );
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
  onChangeDueDate,
  onDuplicateTask,
  onDeleteTask,
  displayConfig = DEFAULT_TASK_DISPLAY_CONFIG,
  collectionView,
  getSource,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
}: TasksCollectionBodyProps) {
  const rowCallbacks = {
    onToggleComplete,
    onOpenTask,
    onChangeDueDate,
    onDuplicateTask,
    onDeleteTask,
    resolveWikiLink,
    resolveTag,
    resolveEmbed,
  };

  if (view === 'tasks-today') {
    const { today } = groupTasks(tasks, displayConfig);
    return (
      <TasksPageBody>
        <CollectionRowList>
          {renderTodayContent({ today, ...rowCallbacks })}
        </CollectionRowList>
      </TasksPageBody>
    );
  }

  if (view === 'tasks-overdue') {
    const { overdue } = groupTasks(tasks, displayConfig);
    return (
      <TasksPageBody>
        <CollectionRowList>
          {renderOverdueContent({ overdue, ...rowCallbacks })}
        </CollectionRowList>
      </TasksPageBody>
    );
  }

  if (view === 'tasks-upcoming') {
    const { upcoming } = groupTasks(tasks, displayConfig);
    return (
      <TasksPageBody>
        <CollectionRowList>
          {renderUpcomingContent({ upcoming, ...rowCallbacks })}
        </CollectionRowList>
      </TasksPageBody>
    );
  }

  if (view === 'tasks-completed') {
    return (
      <TasksPageBody>
        <CollectionRowList>
          {getCompletedTasks(tasks).map((task) => renderTaskRow(task, rowCallbacks))}
        </CollectionRowList>
      </TasksPageBody>
    );
  }

  if (view === 'tasks-unscheduled') {
    return (
      <TasksPageBody>
        <CollectionRowList>
          {groupTasks(tasks, UNSCHEDULED_VIEW_CONFIG).unscheduled.map((task) =>
            renderTaskRow(task, rowCallbacks)
          )}
        </CollectionRowList>
      </TasksPageBody>
    );
  }

  // tasks-all — the configurable All Tasks collection: the page's resolved view (layout, visible
  // properties, sort — the same Configure state every collection uses) decides how it is drawn. Tasks
  // are mapped to the shared property `values` and ordered by the one sort engine; incomplete tasks
  // come first, then completed (newest-completed-first before sorting) — each group sorted by the
  // chosen property, as the page has always shown completed tasks last.
  if (tasks.length === 0) {
    return (
      <TasksPageBody>
        <CollectionEmptyState message={TASKS_COLLECTION.emptyMessage} />
      </TasksPageBody>
    );
  }

  const { layout, visible, sort } = collectionView ?? resolveCollectionView(TASKS_COLLECTION);

  const toEntry = (task: TaskOccurrence): TaskEntry => {
    const source = getSource?.(task);

    return {
      task,
      source,
      // Positional, not task.text — see renderTaskRow's key.
      id: `${task.sourcePageId}:${task.startOffset ?? task.text}`,
      values: taskPropertyValues(task, source?.label),
    };
  };
  const entries = [
    ...sortEntries(tasks.filter((task) => !task.completed).map(toEntry), sort),
    ...sortEntries(getCompletedTasks(tasks).map(toEntry), sort),
  ];

  const titleOf = ({ task }: TaskEntry) => (
    <span className={`task-title ${task.completed ? 'is-completed' : ''}`}>
      {renderCompactMarkdown(formatTaskTitle(task.text, task.dueDate), {
        resolveWikiLink,
        resolveTag,
        resolveEmbed,
      })}
    </span>
  );
  const checkboxOf = ({ task }: TaskEntry) => (
    <Checkbox isChecked={task.completed} onCheckedChange={() => onToggleComplete(task)} />
  );

  if (layout === 'table') {
    return (
      <TasksPageBody>
        <CollectionDataTable
          columns={buildPropertyTableColumns(visible)}
          rows={entries.map((entry) => ({
            id: entry.id,
            cells: {
              name: {
                variant: 'header' as const,
                leading: checkboxOf(entry),
                titleContent: titleOf(entry),
              },
              ...propertyValueCells(visible, entry.values),
            },
            onClick: () => onOpenTask(entry.task),
          }))}
        />
      </TasksPageBody>
    );
  }

  const showDueDate = visible.includes('dueDate');
  const showSource = visible.includes('source');

  const items = entries.map((entry) => {
    const { task, source } = entry;

    return {
      id: entry.id,
      title: task.text,
      leading: checkboxOf(entry),
      titleContent: (
        <span className="task-row-title">
          {titleOf(entry)}
          {/* A task with no due date gets the (hover-only) calendar button right next to its title. */}
          {showDueDate && !task.dueDate && (
            <TaskDueDateButton onChange={(date) => onChangeDueDate(task, date)} />
          )}
        </span>
      ),
      // Trailing slot, in order: the due date (a task with one), then the note the task lives in as a wiki-link-styled link. Both are buttons/links that never open the row's note.
      trailing: (
        <>
          {showDueDate && task.dueDate && (
            <TaskDueDateButton date={task.dueDate} onChange={(date) => onChangeDueDate(task, date)} />
          )}
          {showSource && source && (
            <span
              className="task-row__source"
              role="link"
              tabIndex={0}
              aria-label={`Open ${source.label}`}
              onClick={(event) => {
                event.stopPropagation();
                onOpenTask(task);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onOpenTask(task);
                }
              }}
            >
              <span className="task-row__source-icon">
                <AppIcon icon={source.icon} emoji={source.emoji} size={14} slotSize={16} />
              </span>
              <span className="task-row__source-title">{source.label}</span>
            </span>
          )}
        </>
      ),
      onClick: () => onOpenTask(task),
    };
  });

  return (
    <TasksPageBody>
      <CollectionDataList className="task-list" items={items} />
    </TasksPageBody>
  );
}
