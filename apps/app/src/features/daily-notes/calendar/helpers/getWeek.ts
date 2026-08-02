import type { CalendarDate } from '../models/CalendarDate';

import { isSame, isToday } from '@shared/helpers/time';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';

/**
 * Returns the seven calendar cells
 * for the week containing the visible date.
 */
export function getWeek(
  visibleDate: string,
  selectedDate: string | undefined
): CalendarDate[] {
  // Create a Date from the visible date.
  const start = new Date(visibleDate);

  // Move back to the beginning of the week (Sunday).
  start.setDate(start.getDate() - start.getDay());

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
