import { formatDateDisplay } from '@shared/helpers/time';
import type { ISODate } from '@shared/helpers/time/types';

/**
 * Renders a task's due date for the Tasks sidebar via the shared `'short'` style — the one place the month
 * is abbreviated: `Today`/`Tomorrow`/`Yesterday`, otherwise day + month with no year in the current year
 * (`2 Sep`), and the last two digits of the year in any other (`2 Sep 27`).
 */
export function formatTaskDueDate(dueDate: ISODate): string {
  return formatDateDisplay(dueDate, 'short');
}

/**
 * A task's due date as the shared `'long'` date (`2 September`; the year only in another year) — the same
 * label every other surface uses, with Today/Tomorrow/Yesterday still read by name. Used where there is room
 * for the full date (the All Tasks page), unlike `formatTaskDueDate`'s sidebar-sized label.
 */
export function formatTaskDueDateLong(dueDate: ISODate): string {
  return formatDateDisplay(dueDate, 'long');
}
