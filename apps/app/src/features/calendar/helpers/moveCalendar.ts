import type { CalendarMode } from '../models/CalendarMode';

/**
 * Moves the calendar
 * by week or month.
 */
export function moveCalendar(
  date: string,
  direction: 'previous' | 'next',
  mode: CalendarMode
) {
  const value = new Date(date);

  if (mode === 'week') {
    value.setDate(value.getDate() + (direction === 'next' ? 7 : -7));
  } else {
    value.setMonth(value.getMonth() + (direction === 'next' ? 1 : -1));
  }

  return value.toISOString().slice(0, 10);
}
