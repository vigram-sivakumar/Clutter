import { Task } from '../models/Tasks';

type GroupTasksByDate = {
  [date: string]: Task[];
};

export function groupTasksByDate(tasks: Task[]): GroupTasksByDate {
  return tasks.reduce((groups, task) => {
    const date = task.dueDate;

    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(task);

    return groups;
  }, {} as GroupTasksByDate);
}
