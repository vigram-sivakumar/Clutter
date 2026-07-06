import { Task } from '../models/Tasks';

export function getCompletedTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => task.isCompleted);
}
