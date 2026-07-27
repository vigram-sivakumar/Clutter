import type { TaskOccurrence as Task } from '@core/vault/models/occurrences';
export function getCompletedTasks(tasks: readonly Task[]): readonly Task[] {
  return tasks.filter((task) => task.completed);
}
