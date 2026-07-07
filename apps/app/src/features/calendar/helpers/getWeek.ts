import { CalendarDate } from '../models/CalendarDate';

import { isToday } from './isToday';
import { isSameDate } from './isSameDate';

/**
 * Returns the seven calendar cells
 * for the week containing the visible date.
 */
export function getWeek(
  visibleDate: string,
  selectedDate: string
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

    const isoDate = date.toISOString().slice(0, 10);

    week.push({
      fullDate: isoDate,

      date: date.getDate(),

      isToday: isToday(isoDate),

      isSelected: isSameDate(isoDate, selectedDate),

      // Week view never has outside month days.
      isOutsideMonth: false,
    });
  }

  return week;
}
