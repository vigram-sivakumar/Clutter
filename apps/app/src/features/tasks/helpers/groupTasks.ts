import type { TaskOccurrence } from '@core/vault/models/occurrences';
import { isFuture, isPast, isToday } from '@shared/helpers/time';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';

export type TaskGroups = {
  today: readonly TaskOccurrence[];
  upcoming: readonly TaskOccurrence[];
  // The unscheduled subset of `upcoming`, exposed separately for the
  // dedicated Unscheduled collection view — computed once here rather
  // than re-deriving the same predicate a second time at the call site.
  unscheduled: readonly TaskOccurrence[];
};

/**
 * The Tasks sidebar's Show completed / Auto-sort completed settings
 * (persisted through `TasksViewConfigStore`, resolved to real booleans by
 * the caller) — the two independent toggles the settings menu on the
 * Today/Everything else section headers controls. Passed explicitly to
 * every `groupTasks` call (never defaulted inside `groupTasks` itself) so
 * a call site that must keep its existing behavior — the dedicated
 * Unscheduled collection view, which has never shown completed tasks — says
 * so explicitly rather than silently inheriting whatever the shared
 * Tasks-view preference happens to be.
 */
export interface TaskDisplayConfig {
  readonly showCompleted: boolean;
  readonly autoSortCompleted: boolean;
}

/** The Tasks-view preference's out-of-the-box defaults — completed tasks shown, in their normal position. */
export const DEFAULT_TASK_DISPLAY_CONFIG: TaskDisplayConfig = {
  showCompleted: true,
  autoSortCompleted: false,
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

function isOverdue(task: TaskOccurrence): boolean {
  return task.dueDate != null && isValidCalendarDate(task.dueDate) && isPast(task.dueDate);
}

function isDueInFuture(task: TaskOccurrence): boolean {
  return task.dueDate != null && isValidCalendarDate(task.dueDate) && isFuture(task.dueDate);
}

function byDueDateAscending(a: TaskOccurrence, b: TaskOccurrence): number {
  return a.dueDate!.localeCompare(b.dueDate!);
}

/**
 * A stable partition, not a resort: incomplete tasks keep their existing
 * relative order, completed tasks keep theirs, but every completed task
 * moves after every incomplete one — `Array.prototype.sort` has been
 * required to be stable since ES2019, so this is the one place "auto-sort
 * completed to the bottom" is implemented, reused by every section below
 * rather than each reimplementing its own bottom-sort.
 */
function sortCompletedLast(tasks: readonly TaskOccurrence[]): readonly TaskOccurrence[] {
  return [...tasks].sort((a, b) => Number(a.completed) - Number(b.completed));
}

/**
 * Groups tasks into the Tasks sidebar's Today/Everything else sections
 * (plus Everything else's Unscheduled subset), honoring `config`'s Show
 * completed / Auto-sort completed preference.
 *
 * `config.showCompleted` decides membership: false excludes every
 * completed task from every group (their pre-existing, unaffected
 * behavior); true includes them, bucketed by `dueDate` exactly like an
 * incomplete task — a completed task due today lands in `today`, otherwise
 * it lands in `upcoming` (overdue/future/unscheduled, by the same due-date
 * rule incomplete tasks already use), never in some separate
 * completed-only bucket. This is what "Auto-sort completed off — completed
 * tasks remain in their normal/current ordering" means: a shown completed
 * task sits in its ordinary section, in its ordinary due-date position,
 * exactly the way an incomplete task would.
 *
 * `config.autoSortCompleted` then decides ordering within each section:
 * false leaves the above ordering untouched; true moves every completed
 * task in that section to the bottom, below every incomplete one (see
 * `sortCompletedLast`).
 */
export function groupTasks(
  tasks: readonly TaskOccurrence[],
  config: TaskDisplayConfig
): TaskGroups {
  const eligible = config.showCompleted ? tasks : tasks.filter((task) => !task.completed);

  const today = eligible.filter(isDueToday);

  // "Upcoming" is every eligible task not already shown in Today — overdue
  // first (chronological), then future-dated (chronological), then
  // unscheduled last. A dueDate that isn't null but also isn't placeable in
  // the past/present/future (e.g. a malformed @due value) is treated as
  // unscheduled rather than silently dropped.
  const remaining = eligible.filter((task) => !isDueToday(task));

  const overdue = remaining.filter(isOverdue).sort(byDueDateAscending);
  const future = remaining.filter(isDueInFuture).sort(byDueDateAscending);
  const unscheduled = remaining.filter(
    (task) => !isOverdue(task) && !isDueInFuture(task)
  );

  const upcoming = [...overdue, ...future, ...unscheduled];

  return {
    today: config.autoSortCompleted ? sortCompletedLast(today) : today,
    upcoming: config.autoSortCompleted ? sortCompletedLast(upcoming) : upcoming,
    unscheduled: config.autoSortCompleted ? sortCompletedLast(unscheduled) : unscheduled,
  };
}
