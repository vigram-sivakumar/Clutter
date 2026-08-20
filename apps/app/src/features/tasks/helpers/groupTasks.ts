import type { TaskOccurrence } from '@core/vault/models/occurrences';
import { isFuture, isPast, isToday } from '@shared/helpers/time';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';

export type TaskGroups = {
  today: readonly TaskOccurrence[];
  todayCompleted: readonly TaskOccurrence[];
  upcoming: readonly TaskOccurrence[];
  // The unscheduled subset of `upcoming`, exposed separately for the
  // dedicated Unscheduled collection view — computed once here rather
  // than re-deriving the same predicate a second time at the call site.
  unscheduled: readonly TaskOccurrence[];
};

// `TaskExtractor.ts`'s bare-date extraction is shape-matched only, not
// calendar-validated (documented there) — a task's `dueDate` can be
// `'2026-13-45'`. `toDate()`'s local-component construction (correct for
// genuine dates) silently rolls an out-of-range month/day over into a real
// but fabricated date rather than throwing, so `isPast`/`isFuture` must
// never be handed a calendar-invalid `dueDate` directly — same
// `isValidCalendarDate` gate `DateWidget`/`resolveDate.ts` already apply
// before trusting a Date node. Without this guard such a task would sort
// into `today`/`overdue`/`future` under a silently wrong rolled-over date
// instead of `unscheduled`, the documented fallback below.
function isDueToday(task: TaskOccurrence): boolean {
  return task.dueDate != null && isValidCalendarDate(task.dueDate) && isToday(task.dueDate);
}

function isCompletedToday(task: TaskOccurrence): boolean {
  return task.completedAt != null && isToday(task.completedAt);
}

function isOverdue(task: TaskOccurrence): boolean {
  return task.dueDate != null && isValidCalendarDate(task.dueDate) && isPast(task.dueDate);
}

function isDueInFuture(task: TaskOccurrence): boolean {
  return task.dueDate != null && isValidCalendarDate(task.dueDate) && isFuture(task.dueDate);
}

function byDueDateAscending(a: TaskOccurrence, b: TaskOccurrence): number {
  return a.dueDate!.localeCompare(b.dueDate!);
}

export function groupTasks(tasks: readonly TaskOccurrence[]): TaskGroups {
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
