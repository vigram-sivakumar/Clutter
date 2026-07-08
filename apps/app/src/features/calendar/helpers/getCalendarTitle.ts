import { formatDate } from '@shared/helpers/time';

/**
 * Returns the calendar title.
 */
export function getCalendarTitle(visibleDate: string) {
  return {
    month: formatDate(visibleDate, 'month'),
    year: formatDate(visibleDate, 'monthYear').split(' ')[1],
  };
}
