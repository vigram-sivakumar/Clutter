import { Fragment } from 'react';
import './renderTasksByDate.css';

// Components
import { Task } from '../sidebar/Task';
import { Section } from '@app/layouts/sidebar/section/Section';

// Models
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import type { Workspace } from '@core/workspace/Workspace';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type {
  ResolveTag,
  ResolveWikiLink,
} from '@features/markdown/editor/MarkdownEditor';
import type { ResolvePageEmbed } from '@features/markdown/render/blocks/pageEmbedResolution';

// Helpers
import {
  groupTasks,
  DEFAULT_TASK_DISPLAY_CONFIG,
  type TaskDisplayConfig,
  type TaskGroupId,
  type TaskExpansionKey,
} from './groupTasks';
import { formatTaskDueDate, formatTaskDueDateLong } from './formatTaskDueDate';
import { formatTaskTitle } from './formatTaskTitle';
import { isPast, isToday } from '@shared/helpers/time';
import { EmptyEntry } from '@components/entry/EmptyEntry';
import { ShowMoreEntry } from '@components/entry/ShowMoreEntry';
import { AppIcon } from '@shared/icon';

/** A sidebar list shows this many tasks unless the caller passes the user's own limit; the rest sit behind its "N more" row. */
export const SIDEBAR_GROUP_TASK_LIMIT = 10;

interface TaskRowCallbacks {
  readonly onToggleComplete: (task: TaskOccurrence) => void;
  /** Also what "Show in note" in the row's More Actions menu invokes — same action, same destination. */
  readonly onOpenTask: (task: TaskOccurrence) => void;
  /** Opens the row's Change due date calendar; a date string sets it, null clears it. Reuses TaskOperations.setDate()/clearDate() — never moves the task. */
  readonly onChangeDueDate: (task: TaskOccurrence, date: string | null) => void;
  /** Inserts an exact copy of the task's line directly below the original. */
  readonly onDuplicateTask: (task: TaskOccurrence) => void;
  /** Deletes the task's line from its source note. */
  readonly onDeleteTask: (task: TaskOccurrence) => void;
  /** Opens the task in the Edit task modal (Edit in the row's menu); absent, the row has no Edit. */
  readonly onEditTask?: (task: TaskOccurrence) => void;
}

/** Same injected resolution boundary the page editor uses — see Note's own prop doc comment. */
interface TaskRowResolvers {
  readonly resolveWikiLink?: ResolveWikiLink;
  readonly resolveTag?: ResolveTag;
  readonly resolveEmbed?: ResolvePageEmbed;
}

/** Row presentation switches, separate from the callbacks and resolvers a row is wired with. */
interface TaskRowOptions {
  /** Leaves the due-date label out of the row's trailing slot — for a row under a heading that already says the date. */
  readonly hideDueDate?: boolean;
}

// A due date is never worth showing when it's today — whichever section a
// row is in already conveys "today" by construction, so the label would
// just repeat it. Any other date (including a completed task's past or
// future due date, when Show completed surfaces it in Everything else) is
// shown normally.
export function renderTaskRow(
  task: TaskOccurrence,
  {
    onToggleComplete,
    onOpenTask,
    onChangeDueDate,
    onDuplicateTask,
    onDeleteTask,
    onEditTask,
    resolveWikiLink,
    resolveTag,
    resolveEmbed,
    hideDueDate = false,
  }: TaskRowCallbacks & TaskRowResolvers & TaskRowOptions
) {
  const dueDate = task.dueDate;
  const isDueToday = dueDate != null && isToday(dueDate);
  const isOverdue = !task.completed && dueDate != null && isPast(dueDate);

  return (
    <Task
      // Positional, not task.text — two textually-identical tasks (e.g. one
      // just made by Duplicate, or the same line in two notes) must never
      // share a React key. See TaskOccurrence's own positional-identity note.
      key={`${task.sourcePageId}:${task.startOffset ?? task.text}`}
      title={formatTaskTitle(task.text, dueDate)}
      dueDate={
        dueDate && !isDueToday && !hideDueDate
          ? formatTaskDueDate(dueDate)
          : undefined
      }
      isOverdue={isOverdue}
      date={dueDate}
      isChecked={task.completed}
      onCheckedChange={() => onToggleComplete(task)}
      onClick={() => onOpenTask(task)}
      onChangeDueDate={(next) => onChangeDueDate(task, next)}
      onOpenInNote={() => onOpenTask(task)}
      onDuplicate={() => onDuplicateTask(task)}
      onDelete={() => onDeleteTask(task)}
      onEdit={onEditTask && (() => onEditTask(task))}
      resolveWikiLink={resolveWikiLink}
      resolveTag={resolveTag}
      resolveEmbed={resolveEmbed}
    />
  );
}

/** Renders a flat list of task rows — shared by Today and Upcoming, whose content is otherwise identical (just a different source array). */
function renderTaskList(
  tasks: readonly TaskOccurrence[],
  callbacks: TaskRowCallbacks & TaskRowResolvers & TaskRowOptions
) {
  return (
    <Fragment>{tasks.map((task) => renderTaskRow(task, callbacks))}</Fragment>
  );
}

export interface RenderTodayContentProps
  extends TaskRowCallbacks, TaskRowResolvers {
  // Pre-grouped, not raw tasks, and already filtered/ordered per the
  // Tasks-view display config (groupTasks) — the outer Section
  // (renderTasksByDate) and the Today collection page (TasksCollectionBody)
  // both need this same array to decide their own default-expansion/
  // emptiness, so grouping happens once at whichever call site owns that
  // decision, not again here.
  readonly today: readonly TaskOccurrence[];
}

/**
 * The Today section's content only — with no outer Section wrapper, so
 * both the sidebar (which wraps this in its own collapsible Section) and
 * the Today collection page (embedded directly under the page's own
 * title) render identical rows from one implementation.
 */
export function renderTodayContent({
  today,
  onToggleComplete,
  onOpenTask,
  onChangeDueDate,
  onDuplicateTask,
  onDeleteTask,
  onEditTask,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
}: RenderTodayContentProps) {
  return renderTaskList(today, {
    onToggleComplete,
    onOpenTask,
    onChangeDueDate,
    onDuplicateTask,
    onDeleteTask,
    onEditTask,
    resolveWikiLink,
    resolveTag,
    resolveEmbed,
  });
}

export interface RenderOverdueContentProps
  extends TaskRowCallbacks, TaskRowResolvers {
  // Pre-grouped, not raw tasks — see RenderTodayContentProps.today.
  readonly overdue: readonly TaskOccurrence[];
}

/**
 * The Overdue section's content only — no outer Section wrapper, same reuse
 * reasoning as renderTodayContent. Overdue is never affected by Show
 * completed/Auto-sort completed (groupTasks.ts never puts a completed task
 * in this group), so there is nothing for those preferences to do here.
 */
export function renderOverdueContent({
  overdue,
  onToggleComplete,
  onOpenTask,
  onChangeDueDate,
  onDuplicateTask,
  onDeleteTask,
  onEditTask,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
}: RenderOverdueContentProps) {
  return renderTaskList(overdue, {
    onToggleComplete,
    onOpenTask,
    onChangeDueDate,
    onDuplicateTask,
    onDeleteTask,
    onEditTask,
    resolveWikiLink,
    resolveTag,
    resolveEmbed,
  });
}

export interface RenderUpcomingContentProps
  extends TaskRowCallbacks, TaskRowResolvers {
  // Pre-grouped, not raw tasks — see RenderTodayContentProps.today.
  readonly upcoming: readonly TaskOccurrence[];
}

/**
 * The Upcoming section's content only — no outer Section wrapper, same reuse
 * reasoning as renderTodayContent.
 */
export function renderUpcomingContent({
  upcoming,
  onToggleComplete,
  onOpenTask,
  onChangeDueDate,
  onDuplicateTask,
  onDeleteTask,
  onEditTask,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
}: RenderUpcomingContentProps) {
  return renderTaskList(upcoming, {
    onToggleComplete,
    onOpenTask,
    onChangeDueDate,
    onDuplicateTask,
    onDeleteTask,
    onEditTask,
    resolveWikiLink,
    resolveTag,
    resolveEmbed,
  });
}

interface RenderTasksByDateProps extends TaskRowCallbacks, TaskRowResolvers {
  readonly tasks: readonly TaskOccurrence[];
  readonly workspace: Workspace;
  /** Unused by the section headers now (they only expand/collapse); kept so callers and the Collection routes stay untouched. */
  readonly navigation?: NavigationRouter;
  /**
   * The shared Tasks-view Show completed / Auto-sort completed preference
   * — applied identically to every group. Read-only here: the one control
   * that changes it is the All Tasks row's settings action
   * (TasksShortcuts.tsx), never a group header. Defaults to
   * DEFAULT_TASK_DISPLAY_CONFIG for callers (most tests) that don't care.
   */
  readonly displayConfig?: TaskDisplayConfig;
  /** Groups the user has expanded with their "N more" row — shown in full, with a "Show less" row to fold back. Session-only; the owner decides its lifetime. */
  readonly expandedGroups?: readonly TaskExpansionKey[];
  /** Called when a list's "N more" / "Show less" row is clicked. */
  readonly onToggleGroup?: (key: TaskExpansionKey) => void;
  /** The "Group by due date" Tasks setting: each section lists one group per due date. Off (a flat list per section) by default. */
  readonly groupTasksByDueDate?: boolean;
  /** The Tasks "Show" setting: how many tasks each list (a section, or a date group) shows before its "N more" row. Infinity shows all. */
  readonly itemLimit?: number;
}

export function renderTasksByDate({
  tasks,
  workspace,
  onToggleComplete,
  onOpenTask,
  onChangeDueDate,
  onDuplicateTask,
  onDeleteTask,
  onEditTask,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
  // Every group shown unless the caller says otherwise (the app's own default hides Unscheduled — see AppLayout).
  displayConfig = { ...DEFAULT_TASK_DISPLAY_CONFIG, hiddenGroups: [] },
  expandedGroups = [],
  onToggleGroup,
  groupTasksByDueDate = false,
  itemLimit = SIDEBAR_GROUP_TASK_LIMIT,
}: RenderTasksByDateProps) {
  // Grouped once here — every Section needs this to know whether it's
  // empty (for default expansion) as well as what to render, and
  // renderTodayContent/renderOverdueContent/renderUpcomingContent take the
  // groups directly so groupTasks never runs a second time for the same tree.
  const groups = groupTasks(tasks, displayConfig);
  const { today, overdue, unscheduled } = groups;
  // `groups.upcoming` carries the unscheduled tasks as its tail; they get their own section below.
  const upcoming = groups.upcoming.filter(
    (task) => !unscheduled.includes(task)
  );
  // Today is not a hideable group (the Options menu doesn't offer it and AppLayout drops a stale persisted
  // one), so the Today section below always renders.
  const hidden = displayConfig.hiddenGroups ?? [];

  // A list over the limit shows its first `itemLimit` tasks, then a "N more" row that expands it in full. A list is a
  // section, or — grouped by due date — one date group; each is keyed (and so expanded) on its own.
  const capped = (key: TaskExpansionKey, list: readonly TaskOccurrence[]) =>
    expandedGroups.includes(key) ? list : list.slice(0, itemLimit);
  const moreRow = (key: TaskExpansionKey, list: readonly TaskOccurrence[]) => {
    if (list.length <= itemLimit) {
      return null;
    }
    return (
      <ShowMoreEntry
        hiddenCount={list.length - itemLimit}
        isExpanded={expandedGroups.includes(key)}
        onToggle={() => onToggleGroup?.(key)}
      />
    );
  };
  const rowProps = {
    onToggleComplete,
    onOpenTask,
    onChangeDueDate,
    onDuplicateTask,
    onDeleteTask,
    onEditTask,
    resolveWikiLink,
    resolveTag,
    resolveEmbed,
  };
  // A section's rows. Flat: the section's own tasks, capped as one list. Grouped by due date: one non-collapsible Section
  // per date (the sidebar's shared grouping component), oldest first, headed by the date in the app's long label, each
  // capped and expanded on its own; the heading says the date, so its rows leave out the trailing one. A section with
  // nothing to group by stays flat: Today is one date (its title says so), Unscheduled has none.
  const sectionBody = (id: TaskGroupId, list: readonly TaskOccurrence[]) => {
    if (!groupTasksByDueDate || id === 'today' || id === 'unscheduled') {
      return (
        <>
          {renderTaskList(capped(id, list), rowProps)}
          {moreRow(id, list)}
        </>
      );
    }
    const byDate = new Map<string, TaskOccurrence[]>();
    for (const task of list) {
      const date = task.dueDate ?? '';
      byDate.set(date, [...(byDate.get(date) ?? []), task]);
    }
    // Chronological, whatever order the section's own sort left same-date tasks in; a stable sort keeps each group's order.
    const dates = [...byDate.keys()].sort((a, b) => a.localeCompare(b));
    return (
      <>
        {dates.map((date) => {
          const key: TaskExpansionKey = `${id}:${date}`;
          const tasks = byDate.get(date)!;
          return (
            <Section
              key={key}
              hasHeader
              interaction="subtle"
              title={formatTaskDueDateLong(date)}
            >
              {renderTaskList(capped(key, tasks), {
                ...rowProps,
                hideDueDate: true,
              })}
              {moreRow(key, tasks)}
            </Section>
          );
        })}
      </>
    );
  };

  return (
    <Fragment>
      <Section
        hasHeader
        title="Today"
        // Not collapsible: Today is always open. The hook is for the accent-pill title style (renderTasksByDate.css).
        data-section="today"
      >
        {/* Nothing due today — never scheduled, or all done with completed tasks hidden — says one line
            either way. */}
        {today.length === 0 ? (
          <EmptyEntry>You’re all clear for today</EmptyEntry>
        ) : (
          sectionBody('today', today)
        )}
      </Section>
      {!hidden.includes('overdue') && overdue.length > 0 && (
        <Section
          data-section="overdue"
          hasHeader
          title="Overdue"
          isCollapsible
          isTitleToggle
          isEmpty={overdue.length === 0}
          isExpanded={workspace.isSectionExpanded('tasks-overdue')}
          onExpandedChange={(expanded) =>
            workspace.setSectionExpanded('tasks-overdue', expanded)
          }
        >
          {sectionBody('overdue', overdue)}
        </Section>
      )}
      {!hidden.includes('upcoming') && upcoming.length > 0 && (
        <Section
          hasHeader
          title="Upcoming"
          isCollapsible
          isTitleToggle
          isEmpty={upcoming.length === 0}
          isExpanded={workspace.isSectionExpanded('tasks-upcoming')}
          onExpandedChange={(expanded) =>
            workspace.setSectionExpanded('tasks-upcoming', expanded)
          }
        >
          {sectionBody('upcoming', upcoming)}
        </Section>
      )}
      {!hidden.includes('unscheduled') && unscheduled.length > 0 && (
        <Section
          hasHeader
          title="Unscheduled"
          isCollapsible
          isTitleToggle
          isExpanded={workspace.isSectionExpanded('tasks-unscheduled')}
          onExpandedChange={(expanded) =>
            workspace.setSectionExpanded('tasks-unscheduled', expanded)
          }
        >
          {sectionBody('unscheduled', unscheduled)}
        </Section>
      )}
    </Fragment>
  );
}
