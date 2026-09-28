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
