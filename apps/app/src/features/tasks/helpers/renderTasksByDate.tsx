import { Fragment } from 'react';

// Components
import { Task } from '../sidebar/Task';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Entry } from '@components/entry/Entry';
import { Caret } from '@components/caret/Caret';

// Models
import type { TaskOccurrence as TaskModel } from '@core/vault/models/occurrences';
import type { Workspace } from '@core/workspace/Workspace';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';

// Helpers
import { groupTasks } from './groupTasks';
import { formatTaskDueDate } from './formatTaskDueDate';
import { isPast, isToday } from '@shared/helpers/time';

interface TaskRowCallbacks {
  readonly onToggleComplete: (task: TaskModel) => void;
}

// A due date is never worth showing when it's today — whichever section a
// row is in (the incomplete Today list, or a completed-today task) already
// conveys "today" by construction, so the label would just repeat it. Any
// other date (including a completed task's past or future due date) is
// shown normally.
export function renderTaskRow(task: TaskModel, { onToggleComplete }: TaskRowCallbacks) {
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
      onClick={() => {}}
    />
  );
}

export interface RenderTodayContentProps extends TaskRowCallbacks {
  readonly tasks: readonly TaskModel[];
  readonly workspace: Workspace;
  readonly onOpenCompleted: () => void;
}

/**
 * The Today section's content only — incomplete tasks due today, plus the
 * nested completed-today accordion — with no outer Section wrapper, so
 * both the sidebar (which wraps this in its own collapsible Section) and
 * the Today collection page (embedded directly under the page's own
 * title) render identical rows from one implementation (Phase 2E).
 */
export function renderTodayContent({
  tasks,
  workspace,
  onToggleComplete,
  onOpenCompleted,
}: RenderTodayContentProps) {
  const { today, todayCompleted } = groupTasks(tasks);

  return (
    <Fragment>
      {today.map((task) => renderTaskRow(task, { onToggleComplete }))}

      {todayCompleted.length > 0 && (
        <Fragment>
          <Entry
            leading={
              <Caret
                variant="tree"
                isExpanded={workspace.isSectionExpanded('tasks-today-completed')}
                onClick={(event) => {
                  event.stopPropagation();
                  workspace.toggleSectionExpanded('tasks-today-completed');
                }}
              />
            }
            onClick={onOpenCompleted}
          >
            <span className="text-tertiary">{`${todayCompleted.length} Completed`}</span>
          </Entry>

          {workspace.isSectionExpanded('tasks-today-completed') &&
            todayCompleted.map((task) => renderTaskRow(task, { onToggleComplete }))}
        </Fragment>
      )}
    </Fragment>
  );
}

export interface RenderUpcomingContentProps extends TaskRowCallbacks {
  readonly tasks: readonly TaskModel[];
}

/**
 * The Upcoming section's content only — overdue/future/unscheduled
 * incomplete tasks, in that order — no outer Section wrapper, same reuse
 * reasoning as renderTodayContent.
 */
export function renderUpcomingContent({ tasks, onToggleComplete }: RenderUpcomingContentProps) {
  const { upcoming } = groupTasks(tasks);

  return <Fragment>{upcoming.map((task) => renderTaskRow(task, { onToggleComplete }))}</Fragment>;
}

interface RenderTasksByDateProps extends TaskRowCallbacks {
  readonly tasks: readonly TaskModel[];
  readonly workspace: Workspace;
  readonly navigation: NavigationRouter;
}

export function renderTasksByDate({
  tasks,
  workspace,
  onToggleComplete,
  navigation,
}: RenderTasksByDateProps) {
  return (
    <Fragment>
      <Section
        hasHeader
        title="Today"
        isCollapsible
        isExpanded={workspace.isSectionExpanded('tasks-today')}
        onExpandedChange={() => workspace.toggleSectionExpanded('tasks-today')}
        onClick={() => navigation.openTasksToday()}
      >
        {renderTodayContent({
          tasks,
          workspace,
          onToggleComplete,
          onOpenCompleted: () => navigation.openTasksCompleted(),
        })}
      </Section>

      <Section
        hasHeader
        title="Upcoming"
        isCollapsible
        isExpanded={workspace.isSectionExpanded('tasks-upcoming')}
        onExpandedChange={() => workspace.toggleSectionExpanded('tasks-upcoming')}
        onClick={() => navigation.openTasksUpcoming()}
      >
        {renderUpcomingContent({ tasks, onToggleComplete })}
      </Section>
    </Fragment>
  );
}
