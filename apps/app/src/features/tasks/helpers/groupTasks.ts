import type { TaskOccurrence as Task } from '@core/vault/models/occurrences';
import { isFuture, isPast, isToday } from '@shared/helpers/time';

export type TaskGroups = {
  today: readonly Task[];
  todayCompleted: readonly Task[];
  upcoming: readonly Task[];
  // The unscheduled subset of `upcoming`, exposed separately for the
  // dedicated Unscheduled collection view — computed once here rather
  // than re-deriving the same predicate a second time at the call site.
  unscheduled: readonly Task[];
};

function isDueToday(task: Task): boolean {
  return task.dueDate != null && isToday(task.dueDate);
}

function isCompletedToday(task: Task): boolean {
  return task.completedAt != null && isToday(task.completedAt);
}

function isOverdue(task: Task): boolean {
  return task.dueDate != null && isPast(task.dueDate);
}

function isDueInFuture(task: Task): boolean {
  return task.dueDate != null && isFuture(task.dueDate);
}

function byDueDateAscending(a: Task, b: Task): number {
  return a.dueDate!.localeCompare(b.dueDate!);
}

export function groupTasks(tasks: readonly Task[]): TaskGroups {
  const incomplete = tasks.filter((task) => !task.completed);
  const completed = tasks.filter((task) => task.completed);

  const today = incomplete.filter(isDueToday);
  const todayCompleted = completed.filter(isCompletedToday);

  // "Upcoming" is every incomplete task not already shown in Today —
  // overdue first (chronological), then future-dated (chronological), then
  // unscheduled last. A dueDate that isn't null but also isn't placeable in
  // the past/present/future (e.g. a malformed @due value) is treated as
  // unscheduled rather than silently dropped.
  const remaining = incomplete.filter((task) => !isDueToday(task));

  const overdue = remaining.filter(isOverdue).sort(byDueDateAscending);
  const future = remaining.filter(isDueInFuture).sort(byDueDateAscending);
  const unscheduled = remaining.filter(
    (task) => !isOverdue(task) && !isDueInFuture(task)
  );

  return {
    today,
    todayCompleted,
    upcoming: [...overdue, ...future, ...unscheduled],
    unscheduled,
  };
}
