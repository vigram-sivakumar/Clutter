import { formatDate, formatRelativeDate, isCurrentYear } from '@shared/helpers/time';
import type { ISODate } from '@shared/helpers/time/types';

/**
 * Renders a task's due date for display: relative label (Today/Yesterday/
 * Tomorrow) when applicable, otherwise "12 Jan" or "12 Jan 2027" depending
 * on whether the date falls in the current year.
 */
export function formatTaskDueDate(dueDate: ISODate): string {
  const relative = formatRelativeDate(dueDate);

  if (relative) {
    return relative;
  }

  return isCurrentYear(dueDate)
    ? formatDate(dueDate, 'short')
    : formatDate(dueDate, 'shortDate');
}
