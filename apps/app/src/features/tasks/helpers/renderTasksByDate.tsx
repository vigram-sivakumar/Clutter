import { Fragment } from 'react';

// Components
import { Task } from '../sidebar/Task';
import { Section } from '@app/layouts/sidebar/section/Section';

// Models
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import type { Workspace } from '@core/workspace/Workspace';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { ResolveTag, ResolveWikiLink } from '@features/markdown/editor/MarkdownEditor';
import type { ResolvePageEmbed } from '@features/markdown/render/blocks/pageEmbedResolution';

// Helpers
import { groupTasks, DEFAULT_TASK_DISPLAY_CONFIG, type TaskDisplayConfig } from './groupTasks';
import { formatTaskDueDate } from './formatTaskDueDate';
import { formatTaskTitle } from './formatTaskTitle';
import { isPast, isToday } from '@shared/helpers/time';
import { EmptyEntry } from '@components/entry/EmptyEntry';

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
}

/** Same injected resolution boundary the page editor uses — see Note's own prop doc comment. */
interface TaskRowResolvers {
  readonly resolveWikiLink?: ResolveWikiLink;
  readonly resolveTag?: ResolveTag;
  readonly resolveEmbed?: ResolvePageEmbed;
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
    resolveWikiLink,
    resolveTag,
    resolveEmbed,
  }: TaskRowCallbacks & TaskRowResolvers
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
      dueDate={dueDate && !isDueToday ? formatTaskDueDate(dueDate) : undefined}
      isOverdue={isOverdue}
      date={dueDate}
      isChecked={task.completed}
      onCheckedChange={() => onToggleComplete(task)}
      onClick={() => onOpenTask(task)}
      onChangeDueDate={(next) => onChangeDueDate(task, next)}
      onOpenInNote={() => onOpenTask(task)}
      onDuplicate={() => onDuplicateTask(task)}
      onDelete={() => onDeleteTask(task)}
      resolveWikiLink={resolveWikiLink}
      resolveTag={resolveTag}
      resolveEmbed={resolveEmbed}
    />
  );
}

/** Renders a flat list of task rows — shared by Today and Upcoming, whose content is otherwise identical (just a different source array). */
function renderTaskList(
  tasks: readonly TaskOccurrence[],
  callbacks: TaskRowCallbacks & TaskRowResolvers
) {
  return (
    <Fragment>
      {tasks.map((task) => renderTaskRow(task, callbacks))}
    </Fragment>
  );
}

export interface RenderTodayContentProps extends TaskRowCallbacks, TaskRowResolvers {
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
    resolveWikiLink,
    resolveTag,
    resolveEmbed,
  });
}

export interface RenderOverdueContentProps extends TaskRowCallbacks, TaskRowResolvers {
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
    resolveWikiLink,
    resolveTag,
    resolveEmbed,
  });
}

export interface RenderUpcomingContentProps extends TaskRowCallbacks, TaskRowResolvers {
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
}

export function renderTasksByDate({
  tasks,
  workspace,
  onToggleComplete,
  onOpenTask,
  onChangeDueDate,
  onDuplicateTask,
  onDeleteTask,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
  displayConfig = DEFAULT_TASK_DISPLAY_CONFIG,
}: RenderTasksByDateProps) {
  // Grouped once here — every Section needs this to know whether it's
  // empty (for default expansion) as well as what to render, and
  // renderTodayContent/renderOverdueContent/renderUpcomingContent take the
  // groups directly so groupTasks never runs a second time for the same tree.
  const { today, overdue, upcoming } = groupTasks(tasks, displayConfig);

  return (
    <Fragment>
      <Section
        hasHeader
        title="Today"
        isCollapsible
        isTitleToggle
        isExpanded={workspace.isSectionExpanded('tasks-today')}
        onExpandedChange={(expanded) =>
          workspace.setSectionExpanded('tasks-today', expanded)
        }
      >
        {/* Nothing due today — never scheduled, or all done with completed tasks hidden — says one line
            either way. The section stays expanded so it can say it. */}
        {today.length === 0 ? (
          <EmptyEntry>You're all clear for today</EmptyEntry>
        ) : (
          renderTodayContent({
            today,
            onToggleComplete,
            onOpenTask,
            onChangeDueDate,
            onDuplicateTask,
            onDeleteTask,
            resolveWikiLink,
            resolveTag,
            resolveEmbed,
          })
        )}
      </Section>
      {overdue.length > 0 && (
        <Section
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
          {renderOverdueContent({
            overdue,
            onToggleComplete,
            onOpenTask,
            onChangeDueDate,
            onDuplicateTask,
            onDeleteTask,
            resolveWikiLink,
            resolveTag,
            resolveEmbed,
          })}
        </Section>
      )}
      {upcoming.length > 0 && (
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
          {renderUpcomingContent({
            upcoming,
            onToggleComplete,
            onOpenTask,
            onChangeDueDate,
            onDuplicateTask,
            onDeleteTask,
            resolveWikiLink,
            resolveTag,
            resolveEmbed,
          })}
        </Section>
      )}
    </Fragment>
  );
}
