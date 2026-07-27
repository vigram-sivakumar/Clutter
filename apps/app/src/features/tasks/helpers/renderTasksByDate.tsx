import { Fragment } from 'react';

// Components
import { Task } from '../sidebar/Task';
import { Section } from '@app/layouts/sidebar/section/Section';

// Models
import type { TaskOccurrence as TaskModel } from '@core/vault/models/occurrences';

// Helpers
import { groupTasks } from './groupTasks';

interface RenderTasksByDateProps {
  readonly tasks: readonly TaskModel[];
}

export function renderTasksByDate({ tasks }: RenderTasksByDateProps) {
  // First group tasks into Today, Overdue, Upcoming and Completed.
  const taskGroups = groupTasks(tasks);

  // Convert the grouped object into an array so we can iterate over it.
  // Each entry has the form: [groupName, tasksInGroup]
  return Object.entries(taskGroups).map(([groupName, tasksInGroup]) => {
    // TODO: Restore date grouping once semantic due-date extraction is added
    // to the vault Task model.
    return (
      <Fragment key={groupName}>
        <Section hasHeader title={groupName} isCollapsible onClick={() => {}}>
          {tasksInGroup.map((task) => (
            <Task
              key={task.text}
              title={task.text}
              isChecked={task.completed}
              isEmpty={true}
              onClick={() => {}}
            />
          ))}
        </Section>
      </Fragment>
    );
  });
}
