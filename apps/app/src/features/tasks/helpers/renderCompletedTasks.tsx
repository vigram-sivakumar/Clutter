// Components
import { Task } from '../components/Task';
import { Section } from '@components/sidebar/section/Sidebar.Section';

// Models
import type { Task as TaskModel } from '../models/Tasks';

// Helpers
import { getCompletedTasks } from './getCompletedTasks';

interface RenderCompletedTasksProp {
  tasks: TaskModel[];
}

export function renderCompletedTasks({ tasks }: RenderCompletedTasksProp) {
  const completedTasks = getCompletedTasks(tasks);

  return (
    <Section hasHeader title="Completed" isCollapsible onClick={() => {}}>
      {completedTasks.map((task) => (
        <Task
          key={task.id}
          title={task.title}
          isChecked={task.isCompleted}
          onClick={() => {}}
        />
      ))}
    </Section>
  );
}
