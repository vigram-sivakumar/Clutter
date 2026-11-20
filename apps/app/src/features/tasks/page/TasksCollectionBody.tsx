import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { PageBody } from '@app/layouts/page/body/Page.Body';
import { CollectionEmptyState } from '@features/collection/components/empty/CollectionEmptyState';
import { CollectionSourceLink } from '@features/collection/components/entry/CollectionSourceLink';
import { CollectionDataList } from '@features/collection/components/list/CollectionDataList';
import { Section } from '@app/layouts/sidebar/section/Section';
import { groupByTaskDueDate } from '../helpers/groupByTaskDueDate';
import { classifyDueDate } from '../helpers/taskDueDate';
import '../helpers/renderTasksByDate.css';
import { formatTaskDueDateLong } from '../helpers/formatTaskDueDate';
import { useCollectionItemContextMenu } from '@app/layouts/page/body/useCollectionItemContextMenu';
import { TaskDatePicker } from '../sidebar/TaskDatePicker';
import { buildTaskMenu } from '../helpers/buildTaskMenu';
import { TaskDueDateButton } from './TaskDueDateButton';
import { TaskTitleActions } from './TaskTitleActions';
import { Checkbox } from '@components/checkbox/Checkbox';
import { renderCompactMarkdown } from '@features/markdown/render/renderCompactMarkdown';
import { formatTaskTitle } from '../helpers/formatTaskTitle';
import { taskPropertyValues } from '../helpers/taskPropertyValues';
import { sortEntries } from '@core/properties/collectionSort';
import type { PropertyValues } from '@core/properties/collectionProperties';
import { resolveCollectionView, type ResolvedCollectionView } from '@core/presentation/collection/resolveCollectionView';
import { TASKS_COLLECTION, TASK_INBOX_COLLECTION } from '@core/presentation/collection/collectionDefinitions';
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
  readonly icon: 'tray' | 'note' | 'calendarNote' | 'calendarDot' | 'template';
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
  readonly inboxPageId?: string;
  readonly onOpenLink?: (url: string) => void;
  readonly tasks: readonly TaskOccurrence[];
  readonly onToggleComplete: (task: TaskOccurrence) => void;
  readonly onOpenTask: (task: TaskOccurrence) => void;
  /** Opens a row's Change due date calendar; a date string sets it, null clears it — never moves the task. */
  readonly onChangeDueDate: (task: TaskOccurrence, date: string | null) => void;
  /** Opens the task in the Edit task modal. The row's Edit button (beside the title) is drawn only when this is given. */
  readonly onEditTask?: (task: TaskOccurrence) => void;
  /** Inserts an exact copy of the task directly below it — the row menu's Duplicate. Absent, the menu has none. */
  readonly onDuplicateTask?: (task: TaskOccurrence) => void;
  /** Deletes the task's line from its source note (never the note) — the row menu's Delete. Absent, the menu has none. */
  readonly onDeleteTask?: (task: TaskOccurrence) => void;
  /**
   * Legacy persisted completion preferences. They remain relevant to the separate Inbox collection;
   * All Tasks and its tabs now have explicit active/completed membership.
   */
  readonly displayConfig?: TaskDisplayConfig;
  /**
   * The Task Collection's resolved Configure state (visible properties, sort) — shared by all task datasets, the same
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
    <PageBody className="collection__content" data-task-layout="list">
      {children}
      <div className="collection__bottom-spacer" aria-hidden="true" />
    </PageBody>
  );
}

/**
 * The page body of every task view — ONE renderer. The view decides the dataset (`tasksForView`, the
 * single authority on which tasks belong to Today (overdue + due today) / Upcoming / Unplanned / Completed / All), the
 * shared collection configuration (`collectionView`: layout, properties, sort) decides how that dataset
 * is drawn, through the generic `CollectionDataList`. Deliberately not a
 * CollectionBody variant — CollectionEntryModel (folder/note-shaped) has no room for
 * `completed`/`dueDate` (ADR-022) — so tasks are mapped to the shared property `values` instead
 * (ADR-045, ADR-046). The sidebar keeps its own presentation; exact-date bucketing is shared through
 * `groupByTaskDueDate` (ADR-076).
 */
export function TasksCollectionBody({
  view,
  inboxPageId,
  onOpenLink,
  tasks,
  onToggleComplete,
  onOpenTask,
  onChangeDueDate,
  onEditTask,
  onDuplicateTask,
  onDeleteTask,
  displayConfig = DEFAULT_TASK_DISPLAY_CONFIG,
  collectionView,
  getSource,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
}: TasksCollectionBodyProps) {
  const { visible, sort, groupBy } = collectionView ?? resolveCollectionView(view === 'tasks-inbox' ? TASK_INBOX_COLLECTION : TASKS_COLLECTION);
  const [collapsedGroups, setCollapsedGroups] = useState<readonly string[]>([]);
  const sectionProps = (id: string, title: string) => {
    const key = `${view}:${id}`;
    return {
      hasHeader: true,
      title,
      isCollapsible: true,
      isTitleToggle: true,
      isExpanded: !collapsedGroups.includes(key),
      onExpandedChange: (expanded: boolean) => setCollapsedGroups((current) =>
        expanded ? current.filter((id) => id !== key) : [...current.filter((id) => id !== key), key]),
    };
  };

  // Right-click on a row: the task's More actions — the same canonical task menu the sidebar row shows
  // (`buildTaskMenu`), over the operations this page supplies. Due date opens the calendar beside the row.
  const [datePickerTask, setDatePickerTask] = useState<TaskOccurrence | null>(null);
  const datePickerAnchorRef = useRef<HTMLElement | null>(null);
  const contextMenu = useCollectionItemContextMenu<TaskEntry>((entry) => {
    const { task } = entry;
    const handlers = {
      ...(onEditTask && { edit: () => onEditTask(task) }),
      ...(task.sourcePageId !== inboxPageId && { 'open-in-note': () => onOpenTask(task) }),
      'change-due-date': () => {
        datePickerAnchorRef.current = document.querySelector<HTMLElement>(`[data-context-entry="${CSS.escape(entry.id)}"]`);
        setDatePickerTask(task);
      },
      ...(onDuplicateTask && { duplicate: () => onDuplicateTask(task) }),
      ...(onDeleteTask && { delete: () => onDeleteTask(task) }),
    };
    return { menu: buildTaskMenu(handlers, task.dueDate, 'context'), handlers };
  });

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

  // The view decides the dataset. Ordering uses the collection's sort (Name A→Z by default). The legacy
  // auto-sort preference only has an effect on the separate Inbox collection, which can contain both states.
  const dataset = tasksForView(view, tasks, displayConfig, inboxPageId);
  const entries = displayConfig.autoSortCompleted
    ? [
        ...sortEntries(dataset.filter((task) => !task.completed).map(toEntry), sort),
        ...sortEntries(getCompletedTasks(dataset).map(toEntry), sort),
      ]
    : sortEntries(
        [...dataset.filter((task) => !task.completed), ...getCompletedTasks(dataset)].map(toEntry),
        sort
      );

  // Grouping is controlled by the existing collection preference for every task view,
  // including All Tasks. Keep exact-date sections; do not add planning-level Overdue/Upcoming groups.
  const dateGroups = groupBy === 'dueDate'
    ? groupByTaskDueDate(entries, (entry) => entry.task.dueDate)
    : undefined;

  if (entries.length === 0) {
    const hiddenInboxTasks = view === 'tasks-inbox' && tasksForView(view, tasks, { showCompleted: true }, inboxPageId).length > 0;
    const emptyMessage = view === 'tasks-completed'
      ? 'No completed tasks'
      : view === 'tasks-today'
        ? 'You’re all clear for today'
      : view === 'tasks-all' && tasks.some((task) => task.completed)
        ? 'No active tasks'
        : hiddenInboxTasks
          ? 'No tasks to show with the current settings'
          : (view === 'tasks-inbox' ? TASK_INBOX_COLLECTION : TASKS_COLLECTION).emptyMessage;
    return (
      <TasksPageBody>
        <CollectionEmptyState message={emptyMessage} />
      </TasksPageBody>
    );
  }

  const titleOf = ({ task }: TaskEntry) => (
    <span className={`task-title ${task.completed ? 'is-completed' : ''}`}>
      {renderCompactMarkdown(formatTaskTitle(task.text, task.dueDate, task.dueTime), {
        resolveWikiLink,
        resolveTag,
        resolveEmbed,
        onOpenLink,
      })}
    </span>
  );
  const checkboxOf = ({ task }: TaskEntry) => (
    <Checkbox isChecked={task.completed} onCheckedChange={() => onToggleComplete(task)} />
  );

  // The title (its own slot) and the actions drawn right after it (Edit and the due-date picker — never in an overflow menu), as
  // the title's sibling inside the entry's content.
  const titleSlotOf = (entry: TaskEntry) => <span className="task-row-title">{titleOf(entry)}</span>;
  const actionsOf = (entry: TaskEntry) => (
    <TaskTitleActions
      dueDate={entry.task.dueDate}
      onEdit={onEditTask && (() => onEditTask(entry.task))}
      onChangeDueDate={(date) => onChangeDueDate(entry.task, date)}
    />
  );

  // The due-date control — the task's date, only for a dated task (an undated one has no control; its date is set in
  // the Edit task modal) — and the source as a wiki-link-styled link;
  // none of them opens the row's note.
  const dueDateOf = ({ task }: TaskEntry) =>
    task.dueDate !== undefined && (
      <TaskDueDateButton
        date={task.dueDate}
        time={task.dueTime}
        isOverdue={view === 'tasks-all' && !task.completed && classifyDueDate(task.dueDate) === 'past'}
        onChange={(date) => onChangeDueDate(task, date)}
      />
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

  const menuOverlays = (
    <>
      {contextMenu.overlay}
      {datePickerTask && (
        <TaskDatePicker
          anchorRef={datePickerAnchorRef as RefObject<HTMLElement>}
          open
          onClose={() => setDatePickerTask(null)}
          date={datePickerTask.dueDate}
          onSelect={(date) => {
            setDatePickerTask(null);
            onChangeDueDate(datePickerTask, date);
          }}
          onClear={() => {
            setDatePickerTask(null);
            onChangeDueDate(datePickerTask, null);
          }}
        />
      )}
    </>
  );

  const showDueDate = !dateGroups && visible.includes('dueDate');
  const showSource = visible.includes('source');

  const itemOf = (entry: TaskEntry) => {
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
      props: contextMenu.entryProps(entry),
    };
  };

  if (!dateGroups) {
    return (
      <TasksPageBody>
        <CollectionDataList className="task-list" items={entries.map(itemOf)} />
        {menuOverlays}
      </TasksPageBody>
    );
  }

  return (
    <TasksPageBody>
      {dateGroups.map(({ date, items }) => {
        const isOverdueGroup = (view === 'tasks-today' || view === 'tasks-all') && items.some(({ task }) =>
          !task.completed && classifyDueDate(task.dueDate) === 'past'
        );
        return (
          <Section
            key={date || 'unscheduled'}
            data-section={isOverdueGroup ? 'overdue' : undefined}
            {...sectionProps(date, date ? formatTaskDueDateLong(date) : 'No date')}
          >
            <CollectionDataList className="task-list" items={items.map(itemOf)} />
          </Section>
        );
      })}
      {menuOverlays}
    </TasksPageBody>
  );
}
