import type { TaskOccurrence } from '@core/vault/models/occurrences';
import { isPast, isToday } from '@shared/helpers/time';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';

export type TaskGroups = {
  today: readonly TaskOccurrence[];
  // Due before today and still incomplete — a completed task past its due
  // date is not "still overdue" in the actionable sense the sidebar's
  // Overdue section exists to surface, so it falls through to `upcoming`
  // instead (see the doc comment on `groupTasks` below for why that
  // preserves this change's "don't alter completion semantics" constraint).
  overdue: readonly TaskOccurrence[];
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

// The Overdue section's exact membership rule — due before today, and
// still incomplete — factored out once so both the section itself and
// Upcoming's "not already claimed by Overdue" filter read from the same
// definition rather than restating it.
function isOverdueAndIncomplete(task: TaskOccurrence): boolean {
  return !task.completed && isOverdue(task);
}

// A task belongs in Upcoming's "scheduled" ordering group — sorted
// chronologically ahead of the unscheduled ones — whenever it carries a
// real, calendar-valid due date. That covers both a future-dated task and
// a completed task whose due date is in the past (the one case a valid
// past date reaches `upcoming` at all: see the `overdue` doc comment on
// `TaskGroups`), sorted together by date rather than as two separate runs.
function hasScheduledDueDate(task: TaskOccurrence): boolean {
  return task.dueDate != null && isValidCalendarDate(task.dueDate);
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
 * Groups tasks into the Tasks sidebar's Today/Overdue/Upcoming sections
 * (plus Upcoming's Unscheduled subset), honoring `config`'s Show completed /
 * Auto-sort completed preference. Every eligible task lands in exactly one
 * of the three top-level groups.
 *
 * `config.showCompleted` decides membership the same way it always has:
 * false excludes every completed task from every group (their pre-existing,
 * unaffected behavior); true includes them, bucketed by `dueDate` exactly
 * like an incomplete task would be — with one deliberate exception. Overdue
 * is defined as "due before today AND still incomplete" (a completed task
 * isn't "still overdue" in the actionable sense that section exists to
 * surface), so a completed task with a past due date is never pulled into
 * `overdue` — it falls into `upcoming` instead, exactly where it already
 * lived before this section existed, which is what keeps this change from
 * altering completion display semantics. A completed task due today still
 * lands in `today`, unchanged.
 *
 * `config.autoSortCompleted` then decides ordering within Today/Upcoming:
 * false leaves ordering untouched; true moves every completed task in that
 * section to the bottom, below every incomplete one (see
 * `sortCompletedLast`). Overdue never contains a completed task by
 * definition, so auto-sort has nothing to do there.
 */
export function groupTasks(
  tasks: readonly TaskOccurrence[],
  config: TaskDisplayConfig
): TaskGroups {
  const eligible = config.showCompleted ? tasks : tasks.filter((task) => !task.completed);

  const today = eligible.filter(isDueToday);

  const remaining = eligible.filter((task) => !isDueToday(task));

  // Overdue: due before today, and still incomplete — sorted chronologically,
  // oldest overdue first. `!task.completed` here (rather than relying on
  // `config.showCompleted` alone) is what keeps a completed overdue task out
  // of this section even when Show completed is on.
  const overdue = remaining.filter(isOverdueAndIncomplete).sort(byDueDateAscending);

  // Upcoming: everything eligible that's neither Today nor Overdue — a
  // future-dated task, a completed task whose due date has already passed
  // (see the doc comment above), or an unscheduled one. Scheduled tasks
  // (any calendar-valid due date) sort chronologically first; unscheduled
  // ones (missing, or shape-valid-but-calendar-invalid, e.g. a malformed
  // @due value) come last, keeping their existing relative order rather
  // than being silently dropped.
  const upcomingSource = remaining.filter((task) => !isOverdueAndIncomplete(task));
  const scheduled = upcomingSource.filter(hasScheduledDueDate).sort(byDueDateAscending);
  const unscheduled = upcomingSource.filter((task) => !hasScheduledDueDate(task));

  const upcoming = [...scheduled, ...unscheduled];

  return {
    today: config.autoSortCompleted ? sortCompletedLast(today) : today,
    overdue,
    upcoming: config.autoSortCompleted ? sortCompletedLast(upcoming) : upcoming,
    unscheduled: config.autoSortCompleted ? sortCompletedLast(unscheduled) : unscheduled,
  };
}
