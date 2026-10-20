import { formatDateDisplay } from '@shared/helpers/time';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';

/**
 * A Daily Note's title — the one way every surface writes it: the page header, lists, the Trash, breadcrumbs,
 * pickers, references, autocomplete rows. It is the shared `'heading'` date (`Today, 20 October`,
 * `Sat, 22 October`, `Fri, 5 March 2027`), so it follows the user's Date format preference, the system locale
 * and the year rule exactly as every other date does.
 *
 * Whether a page IS a Daily Note is the domain model's call (`page.type === 'daily-note'`, which a page gets
 * from living at its Daily Notes path), and its calendar date is its canonical `YYYY-MM-DD` name; callers
 * check the first and pass the second. An ordinary note whose title merely looks like a date is never given
 * to this, so it keeps its own title. The `isValidCalendarDate` guard only lets a malformed or synthetic name
 * degrade to the raw string instead of formatting garbage.
 *
 * Display only: the name stays the note's identity (path, link target, search).
 */
export function formatDailyNoteTitle(name: string): string {
  return isValidCalendarDate(name) ? formatDateDisplay(name, 'heading') : name;
}
