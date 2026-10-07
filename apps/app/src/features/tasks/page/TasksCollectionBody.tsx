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
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import type { ResolveTag, ResolveWikiLink } from '@features/markdown/editor/MarkdownEditor';
import type { ResolvePageEmbed } from '@features/markdown/render/blocks/pageEmbedResolution';
import { DEFAULT_TASK_DISPLAY_CONFIG, type TaskDisplayConfig } from '../helpers/groupTasks';
import { getCompletedTasks } from '../helpers/getCompletedTasks';
import { taskViewHasFixedOrder, tasksForView, type TaskViewKind } from '../helpers/tasksForView';

/** The Task Collection's views — the `tasks-*` FilteredView kinds; each is a dataset (see `tasksForView`). */
export type TasksCollectionView = TaskViewKind;

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
  /**
   * The shared Tasks-view Show completed / Auto-sort completed preference (see groupTasks.ts's
   * TaskDisplayConfig). Show completed decides MEMBERSHIP for the views that can hold both states and
   * is applied by `tasksForView` (the rule is documented there); Auto-sort completed is ordering and is
   * applied here. Defaults to DEFAULT_TASK_DISPLAY_CONFIG.
   */
  readonly displayConfig?: TaskDisplayConfig;
  /**
   * The Task Collection's resolved Configure state (layout, visible properties, sort) — shared by all six task views, the same
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
 * The page body of every task view — ONE renderer. The view decides the dataset (`tasksForView`, the
 * single authority on which tasks belong to Today / Overdue / Upcoming / Unscheduled / Done / All), the
 * shared collection configuration (`collectionView`: layout, properties, sort) decides how that dataset
 * is drawn, through the generic `CollectionDataList` / `CollectionDataTable`. Deliberately not a
 * CollectionBody variant — CollectionEntryModel (folder/note-shaped) has no room for
 * `completed`/`dueDate` (ADR-022) — so tasks are mapped to the shared property `values` instead
 * (ADR-045, ADR-046). The sidebar's own sections (`renderTasksByDate`) are a separate presentation and
 * are untouched.
 */
export function TasksCollectionBody({
  view,
  tasks,
  onToggleComplete,
  onOpenTask,
  onChangeDueDate,
  displayConfig = DEFAULT_TASK_DISPLAY_CONFIG,
  collectionView,
  getSource,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
}: TasksCollectionBodyProps) {
  const { layout, visible, sort } = collectionView ?? resolveCollectionView(TASKS_COLLECTION);

  const toEntry = (task: TaskOccurrence): TaskEntry => {
    const source = getSource?.(task);

    return {
      task,
      source,
      // Positional, not task.text — two textually-identical tasks must never share a key.
      id: `${task.sourcePageId}:${task.startOffset ?? task.text}`,
      values: taskPropertyValues(task, source?.label),
    };
  };

  // The view decides the dataset. Ordering: the collection's sort (Name A→Z by default) — except a view
  // with a fixed semantic order of its own (Done: newest-completed-first, applied by `tasksForView`),
  // which the shared sort does not reorder. Otherwise Auto-sort completed on moves completed tasks
  // (newest-completed-first before sorting) below the incomplete ones, each group sorted by the chosen
  // property; off leaves them in their sorted place among the rest.
  const dataset = tasksForView(view, tasks, displayConfig);
  const entries = taskViewHasFixedOrder(view)
    ? dataset.map(toEntry)
    : displayConfig.autoSortCompleted
      ? [
          ...sortEntries(dataset.filter((task) => !task.completed).map(toEntry), sort),
          ...sortEntries(getCompletedTasks(dataset).map(toEntry), sort),
        ]
      : sortEntries(
          [...dataset.filter((task) => !task.completed), ...getCompletedTasks(dataset)].map(toEntry),
          sort
        );

  if (entries.length === 0) {
    return (
      <TasksPageBody>
        <CollectionEmptyState message={TASKS_COLLECTION.emptyMessage} />
      </TasksPageBody>
    );
  }

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
        </span>
      ),
      // Trailing slot, in order: the due-date control — the task's date as a button, or for a task with
      // no date the (hover-only) calendar icon button — then the source as a wiki-link-styled link.
      // None of them opens the row's note.
      trailing: (
        <>
          {showDueDate && (
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
