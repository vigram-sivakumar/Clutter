import { formatDateDisplay } from '@shared/helpers/time';
import type { ISODate } from '@shared/helpers/time/types';

/**
 * Renders a task's due date for display via the shared `'contextual'`
 * rendered-date-label formatter — same underlying date-relationship
 * classification as `@date`'s `DateWidget` (`'compact'` mode) and Daily
 * Note titles (`'full'` mode), just Tasks-sidebar-specific: a compact
 * weekday + day + month for any date in the current year (`Wed 30 Sep`),
 * an abbreviated two-digit year with no weekday otherwise (`19 Nov 27`).
 */
export function formatTaskDueDate(dueDate: ISODate): string {
  return formatDateDisplay(dueDate, 'contextual');
}
