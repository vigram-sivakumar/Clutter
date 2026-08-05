import { Fragment } from 'react';

// Components
import { Task } from '../sidebar/Task';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Entry } from '@components/entry/Entry';
import { Caret } from '@components/caret/Caret';

// Models
import type { TaskOccurrence } from '@core/vault/models/occurrences';
import type { Workspace } from '@core/workspace/Workspace';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';

// Helpers
import { groupTasks } from './groupTasks';
import { formatTaskDueDate } from './formatTaskDueDate';
import { isPast, isToday } from '@shared/helpers/time';
import { CountBadge } from '@components/count-badge/CountBadge';

interface TaskRowCallbacks {
  readonly onToggleComplete: (task: TaskOccurrence) => void;
  readonly onOpenTask: (task: TaskOccurrence) => void;
}

// A due date is never worth showing when it's today — whichever section a
// row is in (the incomplete Today list, or a completed-today task) already
// conveys "today" by construction, so the label would just repeat it. Any
// other date (including a completed task's past or future due date) is
// shown normally.
export function renderTaskRow(
  task: TaskOccurrence,
  { onToggleComplete, onOpenTask }: TaskRowCallbacks
) {
  const dueDate = task.dueDate;
  const isDueToday = dueDate != null && isToday(dueDate);
  const isOverdue = !task.completed && dueDate != null && isPast(dueDate);

  return (
    <Task
      key={task.text}
      title={task.text}
      dueDate={dueDate && !isDueToday ? formatTaskDueDate(dueDate) : undefined}
      isOverdue={isOverdue}
      isChecked={task.completed}
      onCheckedChange={() => onToggleComplete(task)}
      onClick={() => onOpenTask(task)}
    />
  );
}

export interface RenderTodayContentProps extends TaskRowCallbacks {
  // Pre-grouped, not raw tasks — the outer Section (renderTasksByDate) and
  // the Today collection page (TasksCollectionBody) both need these same
  // counts to decide their own default-expansion/emptiness, so grouping
  // happens once at whichever call site owns that decision, not again here.
  readonly today: readonly TaskOccurrence[];
  readonly todayCompleted: readonly TaskOccurrence[];
  readonly workspace: Workspace;
  readonly onOpenCompleted: () => void;
}

/**
 * The Today section's content only — incomplete tasks due today, plus the
 * nested completed-today accordion — with no outer Section wrapper, so
 * both the sidebar (which wraps this in its own collapsible Section) and
 * the Today collection page (embedded directly under the page's own
 * title) render identical rows from one implementation.
 */
export function renderTodayContent({
  today,
  todayCompleted,
  workspace,
  onToggleComplete,
  onOpenTask,
  onOpenCompleted,
}: RenderTodayContentProps) {
  const toggleCompleted = () =>
    workspace.toggleSectionExpanded('tasks-today-completed');

  return (
    <Fragment>
      {today.map((task) =>
        renderTaskRow(task, { onToggleComplete, onOpenTask })
      )}

      {todayCompleted.length > 0 && (
        <Fragment>
          <Entry
            className="tertiary"
            leading={
              <>
                <Caret
                  variant="tree"
                  isExpanded={workspace.isSectionExpanded(
                    'tasks-today-completed'
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCompleted();
                  }}
                />
              </>
            }
            trailing={<CountBadge count={todayCompleted.length} />}
            onClick={onOpenCompleted}
          >
            Completed
          </Entry>

          {workspace.isSectionExpanded('tasks-today-completed') &&
            todayCompleted.map((task) =>
              renderTaskRow(task, { onToggleComplete, onOpenTask })
            )}
        </Fragment>
      )}
    </Fragment>
  );
}

export interface RenderUpcomingContentProps extends TaskRowCallbacks {
  // Pre-grouped, not raw tasks — see RenderTodayContentProps.today.
  readonly upcoming: readonly TaskOccurrence[];
}

/**
 * The Upcoming section's content only — overdue/future/unscheduled
 * incomplete tasks, in that order — no outer Section wrapper, same reuse
 * reasoning as renderTodayContent.
 */
export function renderUpcomingContent({
  upcoming,
  onToggleComplete,
  onOpenTask,
}: RenderUpcomingContentProps) {
  return (
    <Fragment>
      {upcoming.map((task) =>
        renderTaskRow(task, { onToggleComplete, onOpenTask })
      )}
    </Fragment>
  );
}

interface RenderTasksByDateProps extends TaskRowCallbacks {
  readonly tasks: readonly TaskOccurrence[];
  readonly workspace: Workspace;
  readonly navigation: NavigationRouter;
}

export function renderTasksByDate({
  tasks,
  workspace,
  onToggleComplete,
  onOpenTask,
  navigation,
}: RenderTasksByDateProps) {
  // Grouped once here — both Sections need these counts to know whether
  // they're empty (for default expansion) as well as what to render, and
  // renderTodayContent/renderUpcomingContent take the groups directly so
  // groupTasks never runs a second time for the same tree.
  const { today, todayCompleted, upcoming } = groupTasks(tasks);

  return (
    <Fragment>
      <Section
        hasHeader
        title="Today"
        isCollapsible
        isEmpty={today.length === 0 && todayCompleted.length === 0}
        isExpanded={workspace.isSectionExpanded('tasks-today')}
        onExpandedChange={(expanded) =>
          workspace.setSectionExpanded('tasks-today', expanded)
        }
        onClick={() => navigation.openTasksToday()}
      >
        {renderTodayContent({
          today,
          todayCompleted,
          workspace,
          onToggleComplete,
          onOpenTask,
          onOpenCompleted: () => navigation.openTasksCompleted(),
        })}
      </Section>
      <Section
        hasHeader
        title="Everything else"
        isCollapsible
        isEmpty={upcoming.length === 0}
        isExpanded={workspace.isSectionExpanded('tasks-upcoming')}
        onExpandedChange={(expanded) =>
          workspace.setSectionExpanded('tasks-upcoming', expanded)
        }
        onClick={() => navigation.openTasksUpcoming()}
      >
        {renderUpcomingContent({ upcoming, onToggleComplete, onOpenTask })}
      </Section>
    </Fragment>
  );
}
