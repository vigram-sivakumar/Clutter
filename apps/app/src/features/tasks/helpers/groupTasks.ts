import type { TaskOccurrence } from '@core/vault/models/occurrences';
import { classifyDueDate } from './taskDueDate';
import { formatTaskTitle } from './formatTaskTitle';

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
  /**
   * Sidebar sections the user has switched off in the All Tasks settings menu. Presentation only:
   * `groupTasks` ignores it (membership is unchanged) and only the sidebar's `renderTasksByDate`
   * reads it — the Today/Overdue/Upcoming/Unscheduled pages and their navigation entries are unaffected.
   * Absent means every group is shown.
   */
  readonly hiddenGroups?: readonly TaskGroupId[];
}

/** The collapsible sections the Tasks sidebar groups tasks into, in display order. */
export const TASK_GROUP_IDS = ['today', 'overdue', 'upcoming', 'unscheduled'] as const;
export type TaskGroupId = (typeof TASK_GROUP_IDS)[number];
/**
 * The groups the Options menu lets the user switch off — every group but Today, which always stays
 * visible. Anything else (a stale persisted `today`, a hand-edited file) is ignored on load, so Today
 * can never end up hidden with no way to bring it back.
 */
export const HIDEABLE_TASK_GROUP_IDS: readonly TaskGroupId[] = TASK_GROUP_IDS.filter((id) => id !== 'today');

/**
 * The Tasks-view preference's out-of-the-box defaults — completed tasks shown, in their normal position;
 * Overdue and Upcoming sections shown, Unscheduled off until the user turns it on.
 */
export const DEFAULT_TASK_DISPLAY_CONFIG: TaskDisplayConfig = {
  showCompleted: true,
  autoSortCompleted: false,
  hiddenGroups: ['unscheduled'],
};

// Due-date interpretation is centralized in taskDueDate.ts (`classifyDueDate`) — the same one the
// Task Collection's per-view membership (`tasksForView`) uses — so the sidebar and the pages can
// never disagree about what is due today, overdue, scheduled or unscheduled. A shape-valid but
// calendar-invalid date (`2026-13-45`) is `unscheduled`, the documented fallback below.
function isDueToday(task: TaskOccurrence): boolean {
  return classifyDueDate(task.dueDate) === 'today';
}

function isOverdue(task: TaskOccurrence): boolean {
  return classifyDueDate(task.dueDate) === 'past';
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
  return classifyDueDate(task.dueDate) !== 'unscheduled';
}

// Case-insensitive A→Z, against the same displayed-title string the
// sidebar row itself renders (formatTaskTitle — hides the one bare-date
// occurrence that produced dueDate, leaves everything else, including
// other Markdown syntax, untouched) rather than raw `text`, so sort order
// matches what's actually on screen. Array.prototype.sort's stability
// (guaranteed since ES2019) is what preserves existing relative order for
// identical titles — no explicit tie-break needed here.
function byTitle(a: TaskOccurrence, b: TaskOccurrence): number {
  return formatTaskTitle(a.text, a.dueDate).localeCompare(
    formatTaskTitle(b.text, b.dueDate),
    undefined,
    { sensitivity: 'base' }
  );
}

// Due date ascending, falling through to byTitle for tasks sharing the
// same date — the Group → Due date → Title hierarchy every dated section
// (Today, Overdue, Upcoming's scheduled tasks) sorts by.
function byDueDateThenTitle(a: TaskOccurrence, b: TaskOccurrence): number {
  const dueDateComparison = a.dueDate!.localeCompare(b.dueDate!);

  return dueDateComparison !== 0 ? dueDateComparison : byTitle(a, b);
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
 * Within each of those three groups, ordering follows Group → Due date →
 * Title: Today sorts alphabetically by title (every member shares today's
 * date, so date comparison is always a tie); Overdue and Upcoming's
 * scheduled tasks sort chronologically by `dueDate` ascending, falling
 * through to the same alphabetical, case-insensitive title compare
 * whenever two tasks share a date (`byDueDateThenTitle`/`byTitle`).
 * Upcoming's unscheduled tail keeps its own existing (unsorted) relative
 * order, unchanged by this.
 *
 * `config.autoSortCompleted` then decides ordering within Today/Upcoming
 * on top of that: false leaves it untouched; true moves every completed
 * task in that section to the bottom, below every incomplete one (see
 * `sortCompletedLast`) — a stable partition over whatever order the
 * Group → Due date → Title sort already produced, not a second resort.
 * Overdue never contains a completed task by definition, so auto-sort has
 * nothing to do there.
 */
export function groupTasks(
  tasks: readonly TaskOccurrence[],
  config: TaskDisplayConfig
): TaskGroups {
  const eligible = config.showCompleted ? tasks : tasks.filter((task) => !task.completed);

  const today = eligible.filter(isDueToday).sort(byTitle);

  const remaining = eligible.filter((task) => !isDueToday(task));

  // Overdue: due before today, and still incomplete — sorted chronologically,
  // oldest overdue first, then alphabetically for tasks overdue on the same
  // date. `!task.completed` here (rather than relying on
  // `config.showCompleted` alone) is what keeps a completed overdue task out
  // of this section even when Show completed is on.
  const overdue = remaining.filter(isOverdueAndIncomplete).sort(byDueDateThenTitle);

  // Upcoming: everything eligible that's neither Today nor Overdue — a
  // future-dated task, a completed task whose due date has already passed
  // (see the doc comment above), or an unscheduled one. Scheduled tasks
  // (any calendar-valid due date) sort chronologically first, then
  // alphabetically for tasks sharing the same date; unscheduled ones
  // (missing, or shape-valid-but-calendar-invalid, e.g. a malformed @due
  // value) come last, keeping their existing relative order rather than
  // being silently dropped or alphabetized themselves.
  const upcomingSource = remaining.filter((task) => !isOverdueAndIncomplete(task));
  const scheduled = upcomingSource.filter(hasScheduledDueDate).sort(byDueDateThenTitle);
  const unscheduled = upcomingSource.filter((task) => !hasScheduledDueDate(task));

  const upcoming = [...scheduled, ...unscheduled];

  return {
    today: config.autoSortCompleted ? sortCompletedLast(today) : today,
    overdue,
    upcoming: config.autoSortCompleted ? sortCompletedLast(upcoming) : upcoming,
    unscheduled: config.autoSortCompleted ? sortCompletedLast(unscheduled) : unscheduled,
  };
}
