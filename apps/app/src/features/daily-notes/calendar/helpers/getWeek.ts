import type { CalendarDate } from '../models/CalendarDate';

import { isSame, isToday } from '@shared/helpers/time';
import { toDate } from '@shared/helpers/time/helpers/toDate';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import { startOfWeek, type WeekStart } from '../weekStart';

/**
 * Returns the seven calendar cells
 * for the week containing the visible date.
 */
export function getWeek(
  visibleDate: string,
  selectedDate: string | undefined,
  weekStart: WeekStart = 'sunday'
): CalendarDate[] {
  // Create a Date from the visible date.
  // Local-component parse: `new Date('YYYY-MM-DD')` is UTC midnight, which west of UTC is the day before.
  const start = toDate(visibleDate);

  // Move back to the beginning of the week (Sunday unless the user chose Monday).
  startOfWeek(start, weekStart);

  const week: CalendarDate[] = [];

  // Build seven calendar cells.
  for (let index = 0; index < 7; index++) {
    const date = new Date(start);

    // Move forward one day each iteration.
    date.setDate(start.getDate() + index);

    const isoDate = toISODate(date);

    week.push({
      fullDate: isoDate,

      date: date.getDate(),

      isToday: isToday(isoDate),

      // No active Daily Note means nothing is selected — never falls back
      // to "today" or a locally-remembered date (single source of truth
      // is the active page, not the calendar widget).
      isSelected: selectedDate ? isSame(isoDate, selectedDate) : false,

      // Week view never has outside month days.
      isOutsideMonth: false,
    });
  }

  return week;
}
