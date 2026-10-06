import { formatDateDisplay } from '@shared/helpers/time';
import type { ISODate } from '@shared/helpers/time/types';

/**
 * Renders a task's due date for display via the shared `'contextual'`
 * rendered-date-label formatter — same underlying date-relationship
 * classification as `@date`'s `DateWidget` (`'compact'` mode) and Daily
 * Note titles (`'full'` mode), just Tasks-sidebar-specific: day + month,
 * no year, for any date in the current year (`2 Sep`), with an
 * abbreviated two-digit year appended otherwise (`2 Sep 27`).
 */
export function formatTaskDueDate(dueDate: ISODate): string {
  return formatDateDisplay(dueDate, 'contextual');
}

/**
 * A task's due date with its year always shown (`2 Sep 2026`) — same shared
 * `'condensedFullYear'` label the Date property uses, so Today/Tomorrow/
 * Yesterday still read by name. Used where there is room for the full date
 * (the All Tasks page), unlike `formatTaskDueDate`'s sidebar-sized label.
 */
export function formatTaskDueDateWithYear(dueDate: ISODate): string {
  return formatDateDisplay(dueDate, 'condensedFullYear');
}
