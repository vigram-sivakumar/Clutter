import { formatAbsoluteDate } from '@shared/helpers/time/dateDisplay';
import { isValidCalendarDate } from '@shared/helpers/time/helpers/isValidCalendarDate';
import { getSystemLocale } from '@shared/helpers/time/dateLocale';
import { toDate } from '@shared/helpers/time/helpers/toDate';
import { formatDailyNoteTitle } from './formatDailyNoteTitle';


/**
 * Everything a Daily Note can be searched by: its canonical `YYYY-MM-DD` name, and the two ways
 * the app writes its title (`Mon, 24 August 2020`) — straight from `formatDailyNoteTitle`, so a search
 * can never disagree with what the user sees — plus the date spelled out and the weekday in full (the title
 * only abbreviates the weekday, hides the current year and may be numeric, and `monday` or `august 24`
 * should still find the note). The name stays the note's identity (path, link
 * target); this is only text to match a query against, which is why `[[Aug`, `[[August 24` and
 * `[[2026-08-24` all find the same note. Match it with `matchesSearchText`.
 */
export function dailyNoteSearchText(name: string): string {
  const valid = isValidCalendarDate(name);
  // Whatever the Date format preference makes of the day (numeric, abbreviated…), a note can still be found by
  // its month name and its weekday, spelled out in the system locale.
  const spelledOut = valid ? formatAbsoluteDate(name, new Date(), { format: 'full' }) : name;
  const weekday = valid ? new Intl.DateTimeFormat(getSystemLocale(), { weekday: 'long' }).format(toDate(name)) : name;

  return [name, formatDailyNoteTitle(name), spelledOut, weekday].join(' ');
}
