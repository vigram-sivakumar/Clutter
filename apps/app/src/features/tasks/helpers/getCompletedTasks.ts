import type { Task } from '@core/vault/models/Task';

export function getCompletedTasks(tasks: readonly Task[]): readonly Task[] {
  return tasks.filter((task) => task.completed);
}
