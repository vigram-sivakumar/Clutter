// Components
import { Task } from '../sidebar/Task';
import { Section } from '@app/layouts/sidebar/section/Section';

// Models
import type { TaskOccurrence as TaskModel } from '@core/vault/models/occurrences';

// Helpers
import { getCompletedTasks } from './getCompletedTasks';

interface RenderCompletedTasksProps {
  readonly tasks: readonly TaskModel[];
}

export function renderCompletedTasks({ tasks }: RenderCompletedTasksProps) {
  const completedTasks = getCompletedTasks(tasks);

  return (
    <Section hasHeader title="Completed" isCollapsible onClick={() => {}}>
      {completedTasks.map((task) => (
        <Task
          key={task.text}
          title={task.text}
          isChecked={task.completed}
          onClick={() => {}}
        />
      ))}
    </Section>
  );
}
