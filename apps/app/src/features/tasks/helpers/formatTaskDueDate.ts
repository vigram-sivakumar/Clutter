import { formatDateDisplay } from '@shared/helpers/time';
import type { ISODate } from '@shared/helpers/time/types';

/**
 * Renders a task's due date for display via the shared `'condensed'`
 * rendered-date-label formatter — same underlying date-relationship
 * classification as `@date`'s `DateWidget` (`'compact'` mode) and Daily
 * Note titles (`'full'` mode), just a denser month-name form suited to a
 * narrow sidebar row (`27 Aug` rather than `27 August`).
 */
export function formatTaskDueDate(dueDate: ISODate): string {
  return formatDateDisplay(dueDate, 'condensed');
}
