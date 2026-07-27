import type { TaskOccurrence as Task } from '@core/vault/models/occurrences';

type TaskGroups = {
  all: readonly Task[];
};

export function groupTasks(tasks: readonly Task[]): TaskGroups {
  // TODO: Restore semantic grouping (today, overdue, upcoming) once the
  // vault Task model supports extracted due dates.
  return {
    all: tasks,
  };
}
