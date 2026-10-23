import { formatDateDisplay, formatDateTimeDisplay, type DateDisplayOptions } from './dateDisplay';
import { isValidCalendarDate } from './helpers/isValidCalendarDate';
import { toDate } from './helpers/toDate';

/**
 * A `@date` reference as stored in Markdown: a calendar date with an optional local wall-clock time.
 * - `@2026-10-23`: `{ isoDate: '2026-10-23' }`
 * - `@2026-10-23T07:00`: `{ isoDate: '2026-10-23', time: '07:00' }`
 *
 * Storage is canonical and never depends on display preferences: `YYYY-MM-DD`, and a 24-hour `HH:mm` after a `T`.
 * The time is local wall-clock — no zone suffix, no conversion anywhere. Display goes through
 * `formatDateReferenceDisplay`, which follows the user's date-format preference and the system locale.
 */
export interface DateReference {
  readonly isoDate: string;
  /** 24-hour `HH:mm`; absent for a date-only reference. */
  readonly time?: string;
}

const CLOCK_TIME_SHAPE = /^\d{2}:\d{2}$/;
const DATE_REFERENCE_SHAPE = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/;

/** The canonical `HH:mm` for a 24-hour hour and minute. */
export function formatClockTime(hour24: number, minute: number): string {
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Whether `time` is a real 24-hour `HH:mm` (`07:00`, `23:59`; not `24:00`, `7:00`, `12:60`). */
export function isValidClockTime(time: string): boolean {
  if (!CLOCK_TIME_SHAPE.test(time)) {
    return false;
  }
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));
  return hour <= 23 && minute <= 59;
}

/** The canonical stored text, without the `@`. */
export function serializeDateReference(reference: DateReference): string {
  return reference.time === undefined ? reference.isoDate : `${reference.isoDate}T${reference.time}`;
}

/** Splits stored text (without the `@`) into its parts by shape only, or null. Validity is `isValidDateReference`. */
export function parseDateReference(text: string): DateReference | null {
  const match = DATE_REFERENCE_SHAPE.exec(text);
  if (!match) {
    return null;
  }
  return match[2] === undefined ? { isoDate: match[1]! } : { isoDate: match[1]!, time: match[2] };
}

/** Whether the date is a real calendar date and, when there is a time, it is a real time of day. */
export function isValidDateReference(reference: DateReference): boolean {
  return isValidCalendarDate(reference.isoDate) && (reference.time === undefined || isValidClockTime(reference.time));
}

/** The local `Date` a (valid) reference names: local midnight, or the local time on that day. Never UTC-parsed. */
export function dateReferenceToDate(reference: DateReference): Date {
  const date = toDate(reference.isoDate);
  if (reference.time !== undefined) {
    date.setHours(Number(reference.time.slice(0, 2)), Number(reference.time.slice(3, 5)), 0, 0);
  }
  return date;
}

/**
 * How a (valid) reference reads on screen: the date as the user's date-format preference writes it, then, when
 * there is a time, the time in the locale's own clock (`Today, 7:00 AM`, `23/10/2026, 7:00 AM`).
 */
export function formatDateReferenceDisplay(
  reference: DateReference,
  referenceDate: Date = new Date(),
  options: DateDisplayOptions = {}
): string {
  if (reference.time === undefined) {
    return formatDateDisplay(reference.isoDate, 'long', referenceDate, options);
  }
  return formatDateTimeDisplay(dateReferenceToDate(reference), referenceDate, options);
}
