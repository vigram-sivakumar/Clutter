import type { CalendarDate } from '../models/CalendarDate';

import { isSame, isToday } from '@shared/helpers/time';
import { toDate } from '@shared/helpers/time/helpers/toDate';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import { startOfWeek, type WeekStart } from '../weekStart';

/**
 * Returns the calendar cells for a month.
 *
 * Always returns 42 cells (6 weeks).
 */
export function getMonth(
  visibleDate: string,
  selectedDate: string | undefined,
  weekStart: WeekStart = 'sunday'
): CalendarDate[][] {
  // Current visible month.
  // Local-component parse: `new Date('YYYY-MM-DD')` is UTC midnight, which west of UTC is the day before.
  const month = toDate(visibleDate);

  // Start from the first day of the month.
  const start = new Date(month.getFullYear(), month.getMonth(), 1);

  // Move back to the beginning of the week (Sunday unless the user chose Monday).
  startOfWeek(start, weekStart);

  const cells: CalendarDate[] = [];
  const weeks: CalendarDate[][] = [];

  // Build 42 calendar cells.
  for (let index = 0; index < 42; index++) {
    const date = new Date(start);

    // Move forward one day each iteration.
    date.setDate(start.getDate() + index);

    const isoDate = toISODate(date);

    cells.push({
      fullDate: isoDate,

      date: date.getDate(),

      isToday: isToday(isoDate),

      // No active Daily Note means nothing is selected — never falls back
      // to "today" or a locally-remembered date (single source of truth
      // is the active page, not the calendar widget).
      isSelected: selectedDate ? isSame(isoDate, selectedDate) : false,

      // Previous/next month days.
      isOutsideMonth: date.getMonth() !== month.getMonth(),
    });
  }

  // Split the 42 cells into six weeks.
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return weeks;
}
