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
  // dedicated Unplanned collection view — computed once here rather
  // than re-deriving the same predicate a second time at the call site.
  unscheduled: readonly TaskOccurrence[];
};

/**
 * Display preferences shared with the task collection renderer. The sidebar
 * now always excludes completed tasks; only `hiddenGroups` affects its
 * presentation. The legacy completion fields remain readable for existing
 * Inbox collection preferences.
 */
export interface TaskDisplayConfig {
  readonly showCompleted: boolean;
  readonly autoSortCompleted: boolean;
  /**
   * Sidebar sections the user has switched off in the Tasks settings page. Presentation only:
   * `groupTasks` ignores it (membership is unchanged) and only the sidebar's `renderTasksByDate`
   * reads it — the Today/Overdue/Upcoming/Unplanned pages and their navigation entries are unaffected.
   * Absent means every group is shown.
   */
  readonly hiddenGroups?: readonly TaskGroupId[];
}

/** The collapsible sections the Tasks sidebar groups tasks into, in display order. */
export const TASK_GROUP_IDS = ['today', 'overdue', 'upcoming', 'unscheduled'] as const;
export type TaskGroupId = (typeof TASK_GROUP_IDS)[number];
/**
 * What a sidebar list's "N more" expansion is keyed by: a whole section (`overdue`), or — with Group by due date on — one
 * date group inside it (`overdue:2026-08-01`). Each key expands on its own.
 */
export type TaskExpansionKey = TaskGroupId | `${TaskGroupId}:${string}`;
/**
 * The groups the Tasks settings page lets the user switch off — every group but Today, which always stays
 * visible. Anything else (a stale persisted `today`, a hand-edited file) is ignored on load, so Today
 * can never end up hidden with no way to bring it back.
 */
export const HIDEABLE_TASK_GROUP_IDS: readonly TaskGroupId[] = TASK_GROUP_IDS.filter((id) => id !== 'today');

/**
 * Default presentation: all task groups except Unplanned are shown in the sidebar.
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
  return formatTaskTitle(a.text, a.dueDate, a.dueTime).localeCompare(
    formatTaskTitle(b.text, b.dueDate, b.dueTime),
    undefined,
    { sensitivity: 'base' }
  );
}

// Time ascending, a timed task always before a time-less one on the same
// date (the explicit boolean check below, not a string-sort trick — never
// invented by treating a missing time as midnight), falling through to
// byTitle for a further tie. Never invents a time for an undated task:
// this only ever compares tasks that already share a due date
// (byDueDateThenTitle's tie-break, and Today's own sort, where every
// member shares today's date by construction).
function byTimeThenTitle(a: TaskOccurrence, b: TaskOccurrence): number {
  const aHasTime = a.dueTime !== undefined;
  const bHasTime = b.dueTime !== undefined;

  if (aHasTime !== bHasTime) {
    return aHasTime ? -1 : 1;
  }

  const timeComparison = aHasTime && bHasTime ? a.dueTime.localeCompare(b.dueTime) : 0;

  return timeComparison !== 0 ? timeComparison : byTitle(a, b);
}

// Due date ascending, then time (byTimeThenTitle, which also carries the
// title tie-break) — the Group → Due date → Time → Title hierarchy every
// dated section (Overdue, Upcoming's scheduled tasks) sorts by.
function byDueDateThenTitle(a: TaskOccurrence, b: TaskOccurrence): number {
  const dateComparison = a.dueDate!.localeCompare(b.dueDate!);

  return dateComparison !== 0 ? dateComparison : byTimeThenTitle(a, b);
}

/**
 * Groups only active tasks into the Tasks sidebar's Today/Overdue/Upcoming sections
 * (plus Upcoming's Unplanned subset). Completed tasks are available in the Tasks
 * collection's dedicated Completed tab and never appear in the sidebar.
 *
 * Ordering follows Group → Due date → Time → Title. Today sorts by time then title;
 * Overdue and Upcoming's scheduled tasks sort chronologically by due date, then
 * time and title. Unplanned tasks retain their source order at the end of Upcoming.
 */

export function groupTasks(
  tasks: readonly TaskOccurrence[],
  _config?: TaskDisplayConfig
): TaskGroups {
  const eligible = tasks.filter((task) => !task.completed);

  const today = eligible.filter(isDueToday).sort(byTimeThenTitle);

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
    today,
    overdue,
    upcoming,
    unscheduled,
  };
}
