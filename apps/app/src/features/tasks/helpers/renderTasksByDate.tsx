import { Fragment } from 'react';

// Components
import { Task } from '../components/Task';
import { Section } from '@components/sidebar/section/Sidebar.Section';

// Models
import type { Task as TaskModel } from '../models/Tasks';

// Helpers
import { groupTasks } from './groupTasks';
import { groupTasksByDate } from './groupByDate';

interface RenderTasksByDateProps {
  tasks: TaskModel[];
}

export function renderTasksByDate({ tasks }: RenderTasksByDateProps) {
  // First group tasks into Today, Overdue, Upcoming and Completed.
  const taskGroups = groupTasks(tasks);

  // Convert the grouped object into an array so we can iterate over it.
  // Each entry has the form: [groupName, tasksInGroup]
  return Object.entries(taskGroups).map(([groupName, tasksInGroup]) => {
    // Group only the tasks that belong to this section by due date.
    const dateGroups = groupTasksByDate(tasksInGroup);

    return (
      <Fragment key={groupName}>
        {/* Render the task group heading. */}
        <Section hasHeader title={groupName} isCollapsible onClick={() => {}}>
          {/* Render every date inside the current task group. */}
          {Object.entries(dateGroups).map(([date, tasksForDate]) => (
            <Section key={date} hasHeader title={date}>
              {/* Render every task for this date. */}
              {tasksForDate.map((task) => (
                <Task
                  key={task.id}
                  title={task.title}
                  isChecked={task.isCompleted}
                  isEmpty={true}
                  onClick={() => {}}
                />
              ))}
            </Section>
          ))}
        </Section>
      </Fragment>
    );
  });
}
