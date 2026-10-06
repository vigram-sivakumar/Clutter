import { formatDate, formatDateDisplay } from '@shared/helpers/time';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';

/**
 * A real Daily Note's name is always its canonical `YYYY-MM-DD` (enforced
 * at classification time — DailyNotePath's convention). The
 * `isValidCalendarDate` guard exists only so a malformed/synthetic name
 * degrades to showing the raw string instead of formatting garbage —
 * mirrors `DateWidget`'s own guard before calling `formatDateDisplay`.
 *
 * The Daily Note's own page title: the day, then the full date
 * (`Today, 4 October 2026`).
 */
export function formatDailyNoteTitle(name: string): string {
  return isValidCalendarDate(name) ? formatDateDisplay(name, 'full') : name;
}

/**
 * A Daily Note's date without the relative-day prefix ("Today,", "Yesterday,", a weekday) —
 * `6 October 2026`. That prefix belongs to the Daily Note page's own title
 * (`formatDailyNoteTitle`); every other generic surface that names a Daily Note (lists, the Trash,
 * breadcrumbs) shows just the date. Same shared `formatDate` the rest of the app uses, same
 * malformed-name guard.
 */
export function formatDailyNoteDateLabel(name: string): string {
  return isValidCalendarDate(name) ? formatDate(name, 'longDate') : name;
}

/**
 * A Daily Note's title as one row of a list (the note picker), where room is short: it reads the
 * way dates do elsewhere in the app (`'condensed'`) — Today / Yesterday / Tomorrow, a weekday name
 * within the current week, otherwise a short month and day (`2 Oct`), with the year only when it
 * isn't the current one (`31 Dec 2025`). Not used for the page itself, which keeps the full title.
 */
export function formatDailyNotePickerTitle(name: string): string {
  return isValidCalendarDate(name) ? formatDateDisplay(name, 'condensed') : name;
}
