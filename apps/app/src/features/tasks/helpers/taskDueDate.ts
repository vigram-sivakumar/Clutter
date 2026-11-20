import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';

/**
 * Where a task's explicit due date sits relative to today — the ONE interpretation of a due date
 * for every task view (the page's Today / Overdue / Upcoming / Unscheduled datasets via
 * `tasksForView`, and the sidebar's `groupTasks`), so no view can parse or compare dates on its own.
 *
 * - `unscheduled`: no due date, OR one that is not a real calendar date. `TaskExtractor` captures a
 *   shape-valid date such as `2026-13-45` without validating it, and `toDate()` would silently roll
 *   it into a fabricated real date, so an invalid date is treated as "no valid explicit due date"
 *   rather than guessed at.
 * - `today` / `past` / `future`: a valid date compared by LOCAL calendar day (the app's existing
 *   `isToday` / `isPast` convention). A date-only value has no time of day or timezone: it is the
 *   user's local day, and "today" is the local day of `new Date()`.
 *
 * The note a task lives in never enters this: a task in today's Daily Note with no due date is
 * `unscheduled`, not `today` (ADR-044).
 */
export type DueDateRelation = 'unscheduled' | 'today' | 'past' | 'future';

export function classifyDueDate(dueDate: string | undefined): DueDateRelation {
  if (dueDate == null || !isValidCalendarDate(dueDate)) {
    return 'unscheduled';
  }

  // Both values are validated/local YYYY-MM-DD calendar dates, so lexical comparison
  // gives the correct day relation without introducing Date parsing or time-of-day effects.
  const today = toISODate(new Date());
  if (dueDate === today) {
    return 'today';
  }

  return dueDate < today ? 'past' : 'future';
}
