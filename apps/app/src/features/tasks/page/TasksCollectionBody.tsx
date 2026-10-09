import type { ReactNode } from 'react';
import { PageBody } from '@app/layouts/page/body/Page.Body';
import { CollectionEmptyState } from '@features/collection/components/empty/CollectionEmptyState';
import { CollectionSourceLink } from '@features/collection/components/entry/CollectionSourceLink';
import { CollectionDataList } from '@features/collection/components/list/CollectionDataList';
import { CollectionDataTable } from '@features/collection/components/table/CollectionDataTable';
import { buildPropertyTableColumns, propertyValueCells } from '@features/collection/properties/tableColumns';
import { TaskDueDateButton } from './TaskDueDateButton';
import { TaskTitleActions } from './TaskTitleActions';
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
import { tasksForView, type TaskViewKind } from '../helpers/tasksForView';

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
  /** Opens the task in the Edit task modal. The row's Edit button (beside the title) is drawn only when this is given. */
  readonly onEditTask?: (task: TaskOccurrence) => void;
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
  onEditTask,
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

  // The view decides the dataset. Ordering: the collection's sort (Name A→Z by default). Auto-sort completed
  // on moves completed tasks (newest-completed-first before sorting) below the incomplete ones, each group
  // sorted by the chosen property; off leaves them in their sorted place among the rest.
  const dataset = tasksForView(view, tasks, displayConfig);
  const entries = displayConfig.autoSortCompleted
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

  // The title (its own slot) and the actions drawn right after it (Edit and the due-date picker — never in an overflow menu), as
  // the title's sibling inside the entry's content; one definition each for the List and the Table.
  const titleSlotOf = (entry: TaskEntry) => <span className="task-row-title">{titleOf(entry)}</span>;
  const actionsOf = (entry: TaskEntry) => (
    <TaskTitleActions
      dueDate={entry.task.dueDate}
      onEdit={onEditTask && (() => onEditTask(entry.task))}
      onChangeDueDate={(date) => onChangeDueDate(entry.task, date)}
    />
  );

  // The due-date control — the task's date, only for a dated task (an undated one has no control; its date is set in
  // the Edit task modal) — and the source as a wiki-link-styled link. One definition each for the List and the Table;
  // none of them opens the row's note.
  const dueDateOf = ({ task }: TaskEntry) =>
    task.dueDate !== undefined && (
      <TaskDueDateButton date={task.dueDate} onChange={(date) => onChangeDueDate(task, date)} />
    );
  const sourceOf = ({ task, source }: TaskEntry) =>
    source && (
      <CollectionSourceLink
        label={source.label}
        icon={source.icon}
        emoji={source.emoji}
        onOpen={() => onOpenTask(task)}
      />
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
                titleContent: titleSlotOf(entry),
                actions: actionsOf(entry),
              },
              ...propertyValueCells(visible, entry.values),
              // The same controls as the List's trailing slot (a task with no source keeps the empty text cell).
              ...(visible.includes('dueDate') &&
                entry.task.dueDate !== undefined && { dueDate: { variant: 'custom' as const, children: dueDateOf(entry) } }),
              ...(visible.includes('source') &&
                entry.source && { source: { variant: 'custom' as const, children: sourceOf(entry) } }),
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
      titleContent: titleSlotOf(entry),
      actions: actionsOf(entry),
      // Trailing slot, in order: the due-date control, then the source link (see `dueDateOf` / `sourceOf`).
      trailing: (
        <>
          {showDueDate && dueDateOf(entry)}
          {showSource && source && sourceOf(entry)}
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
