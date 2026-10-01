import { Fragment } from 'react';

// Components
import { Task } from '../sidebar/Task';
import { TasksSectionSettingsMenu } from '../sidebar/TasksSectionSettingsMenu';
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

interface TaskRowCallbacks {
  readonly onToggleComplete: (task: TaskOccurrence) => void;
  /** Also what "Open in note" in the row's More Actions menu invokes — same action, same destination. */
  readonly onOpenTask: (task: TaskOccurrence) => void;
  /** Opens the Edit Task modal for this task. */
  readonly onEditTask: (task: TaskOccurrence) => void;
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
    onEditTask,
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
      key={task.text}
      title={formatTaskTitle(task.text, dueDate)}
      dueDate={dueDate && !isDueToday ? formatTaskDueDate(dueDate) : undefined}
      isOverdue={isOverdue}
      isChecked={task.completed}
      onCheckedChange={() => onToggleComplete(task)}
      onClick={() => onOpenTask(task)}
      onEdit={() => onEditTask(task)}
      onOpenInNote={() => onOpenTask(task)}
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
  onEditTask,
  onDeleteTask,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
}: RenderTodayContentProps) {
  return renderTaskList(today, {
    onToggleComplete,
    onOpenTask,
    onEditTask,
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
  onEditTask,
  onDeleteTask,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
}: RenderOverdueContentProps) {
  return renderTaskList(overdue, {
    onToggleComplete,
    onOpenTask,
    onEditTask,
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
  onEditTask,
  onDeleteTask,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
}: RenderUpcomingContentProps) {
  return renderTaskList(upcoming, {
    onToggleComplete,
    onOpenTask,
    onEditTask,
    onDeleteTask,
    resolveWikiLink,
    resolveTag,
    resolveEmbed,
  });
}

/** A section header's own settings-menu open state, owned by the caller (see TasksSectionSettingsMenu's own doc comment for why). */
export interface TasksSectionSettingsMenuState {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const CLOSED_SETTINGS_MENU: TasksSectionSettingsMenuState = {
  open: false,
  onOpenChange: () => {},
};

interface RenderTasksByDateProps extends TaskRowCallbacks, TaskRowResolvers {
  readonly tasks: readonly TaskOccurrence[];
  readonly workspace: Workspace;
  readonly navigation: NavigationRouter;
  /**
   * The shared Tasks-view Show completed / Auto-sort completed preference
   * — one value, read and written identically by both the Today and
   * Everything else section's own settings menu (never one preference per
   * section). Defaults to DEFAULT_TASK_DISPLAY_CONFIG/a no-op setter for
   * callers (most existing tests) that don't exercise the settings menu.
   */
  readonly displayConfig?: TaskDisplayConfig;
  readonly onDisplayConfigChange?: (next: TaskDisplayConfig) => void;
  readonly todaySettingsMenu?: TasksSectionSettingsMenuState;
  readonly upcomingSettingsMenu?: TasksSectionSettingsMenuState;
}

export function renderTasksByDate({
  tasks,
  workspace,
  onToggleComplete,
  onOpenTask,
  onEditTask,
  onDeleteTask,
  navigation,
  resolveWikiLink,
  resolveTag,
  resolveEmbed,
  displayConfig = DEFAULT_TASK_DISPLAY_CONFIG,
  onDisplayConfigChange = () => {},
  todaySettingsMenu = CLOSED_SETTINGS_MENU,
  upcomingSettingsMenu = CLOSED_SETTINGS_MENU,
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
        isEmpty={today.length === 0}
        isExpanded={workspace.isSectionExpanded('tasks-today')}
        onExpandedChange={(expanded) =>
          workspace.setSectionExpanded('tasks-today', expanded)
        }
        onClick={() => navigation.openTasksToday()}
        forceHover={todaySettingsMenu.open}
        actions={
          <TasksSectionSettingsMenu
            config={displayConfig}
            onConfigChange={onDisplayConfigChange}
            open={todaySettingsMenu.open}
            onOpenChange={todaySettingsMenu.onOpenChange}
          />
        }
      >
        {renderTodayContent({
          today,
          onToggleComplete,
          onOpenTask,
          onEditTask,
          onDeleteTask,
          resolveWikiLink,
          resolveTag,
          resolveEmbed,
        })}
      </Section>
      {overdue.length > 0 && (
        <Section
          hasHeader
          title="Overdue"
          isCollapsible
          isEmpty={overdue.length === 0}
          isExpanded={workspace.isSectionExpanded('tasks-overdue')}
          onExpandedChange={(expanded) =>
            workspace.setSectionExpanded('tasks-overdue', expanded)
          }
          onClick={() => navigation.openTasksOverdue()}
        >
          {renderOverdueContent({
            overdue,
            onToggleComplete,
            onOpenTask,
            onEditTask,
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
          isEmpty={upcoming.length === 0}
          isExpanded={workspace.isSectionExpanded('tasks-upcoming')}
          onExpandedChange={(expanded) =>
            workspace.setSectionExpanded('tasks-upcoming', expanded)
          }
          onClick={() => navigation.openTasksUpcoming()}
          forceHover={upcomingSettingsMenu.open}
          actions={
            <TasksSectionSettingsMenu
              config={displayConfig}
              onConfigChange={onDisplayConfigChange}
              open={upcomingSettingsMenu.open}
              onOpenChange={upcomingSettingsMenu.onOpenChange}
            />
          }
        >
          {renderUpcomingContent({
            upcoming,
            onToggleComplete,
            onOpenTask,
            onEditTask,
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
