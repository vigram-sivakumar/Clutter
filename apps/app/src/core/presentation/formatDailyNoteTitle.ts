import { formatDateDisplay } from '@shared/helpers/time';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';

/**
 * A real Daily Note's name is always its canonical `YYYY-MM-DD` (enforced
 * at classification time — DailyNotePath's convention). The
 * `isValidCalendarDate` guard exists only so a malformed/synthetic name
 * degrades to showing the raw string instead of formatting garbage —
 * mirrors `DateWidget`'s own guard before calling `formatDateDisplay`.
 *
 * The one owner of a Daily Note's date title: the page header and the note
 * pickers both read it from here.
 */
export function formatDailyNoteTitle(name: string): string {
  return isValidCalendarDate(name) ? formatDateDisplay(name, 'full') : name;
}
