import { formatMonth } from '@shared/helpers/date/formatMonth';

/**
 * Returns the calendar title.
 */
export function getCalendarTitle(visibleDate: string) {
  return {
    month: formatMonth(visibleDate),
    year: new Date(visibleDate).getFullYear().toString(),
  };
}
