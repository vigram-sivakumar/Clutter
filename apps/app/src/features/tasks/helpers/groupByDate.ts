import type { Task } from '@core/vault/models/Task';

type GroupTasksByDate = {
  [date: string]: readonly Task[];
};

export function groupTasksByDate(tasks: readonly Task[]): GroupTasksByDate {
  // TODO: Group tasks by semantic due date once Task extraction supports
  // due dates. For now, the vault Task model intentionally contains only
  // text and completion state, so all tasks are returned in a single group.
  return {
    'All Tasks': tasks,
  };
}
