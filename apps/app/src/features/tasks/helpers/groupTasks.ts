import { Task } from '../models/Tasks';

type TaskGroups = {
  today: Task[];
  overdue: Task[];
  upcoming: Task[];
};

const createInitialGroups = (): TaskGroups => ({
  today: [],
  overdue: [],
  upcoming: [],
});

export function groupTasks(tasks: Task[]): TaskGroups {
  const today = new Date()

    .toISOString() // Returns "YYYY-MM-DDTHH:mm:ss.sssZ"
    .slice(0, 10);

  return tasks.reduce((groups, task) => {
    let group: keyof TaskGroups;

    if (task.dueDate === today) {
      group = 'today';
    } else if (task.dueDate < today) {
      group = 'overdue';
    } else {
      group = 'upcoming';
    }

    groups[group].push(task);

    return groups;
  }, createInitialGroups());
}
