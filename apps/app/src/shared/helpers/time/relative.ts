import { isToday, isTomorrow, isYesterday } from '@shared/helpers/time/compare';
import type { ISODate } from '@shared/helpers/time/types';

/**
 * Returns a relative date label.
 */
export function formatRelativeDate(date: ISODate) {
  if (isToday(date)) {
    return 'Today';
  }

  if (isYesterday(date)) {
    return 'Yesterday';
  }

  if (isTomorrow(date)) {
    return 'Tomorrow';
  }

  return null;
}
