import type { ISODate } from '../types';

/**
 * Whether `isoDate` is a real calendar date, not just shaped like one —
 * the parse-vs-validate distinction already established for `@due:`-style
 * property values (docs/editor-research/clutter-editor-shared-semantic-inline-model.md):
 * a Date semantic token's *grammar* only checks shape (`YYYY-MM-DD`), so
 * `@2026-13-45` still parses as a `Date` node; this is the separate,
 * later check for whether it's a genuine date. Same rollover-rejection
 * technique `DailyNotePath.parseCanonicalDate` already uses (`Date` rolls
 * an invalid day/month over into the next period instead of throwing —
 * round-tripping the parsed components back through the constructor's own
 * getters catches that rather than trusting the input at face value).
 */
export function isValidCalendarDate(isoDate: ISODate): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return false;
  }

  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}
