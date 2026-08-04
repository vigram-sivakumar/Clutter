import { Fragment } from 'react';

// Components
import { Task } from '../sidebar/Task';
import { Section } from '@app/layouts/sidebar/section/Section';

// Models
import type { TaskOccurrence as TaskModel } from '@core/vault/models/occurrences';
import type { Workspace } from '@core/workspace/Workspace';

// Helpers
import { groupTasks } from './groupTasks';
import { formatTaskDueDate } from './formatTaskDueDate';
import { isPast } from '@shared/helpers/time';

interface RenderTasksByDateProps {
  readonly tasks: readonly TaskModel[];
  readonly workspace: Workspace;
}

function renderTaskRow(task: TaskModel) {
  const isOverdue = task.dueDate != null && isPast(task.dueDate);

  return (
    <Task
      key={task.text}
      title={task.text}
      dueDate={task.dueDate ? formatTaskDueDate(task.dueDate) : undefined}
      isOverdue={isOverdue}
      isChecked={task.completed}
      onClick={() => {}}
    />
  );
}

export function renderTasksByDate({ tasks, workspace }: RenderTasksByDateProps) {
  const { today, todayCompleted, upcoming } = groupTasks(tasks);

  return (
    <Fragment>
      <Section
        hasHeader
        title="Today"
        isCollapsible
        isExpanded={workspace.isSectionExpanded('tasks-today')}
        onExpandedChange={() => workspace.toggleSectionExpanded('tasks-today')}
      >
        {today.map(renderTaskRow)}

        {todayCompleted.length > 0 && (
          <Section
            hasHeader
            title="Completed"
            isCollapsible
            isExpanded={workspace.isSectionExpanded('tasks-today-completed')}
            onExpandedChange={() =>
              workspace.toggleSectionExpanded('tasks-today-completed')
            }
          >
            {todayCompleted.map(renderTaskRow)}
          </Section>
        )}
      </Section>

      <Section
        hasHeader
        title="Upcoming"
        isCollapsible
        isExpanded={workspace.isSectionExpanded('tasks-upcoming')}
        onExpandedChange={() => workspace.toggleSectionExpanded('tasks-upcoming')}
      >
        {upcoming.map(renderTaskRow)}
      </Section>
    </Fragment>
  );
}
