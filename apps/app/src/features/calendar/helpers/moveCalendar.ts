import { addMonths, addWeeks } from '@shared/helpers/time';
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
  const value = direction === 'next' ? 1 : -1;

  if (mode === 'week') {
    return addWeeks(date, value);
  }

  return addMonths(date, value);
}
