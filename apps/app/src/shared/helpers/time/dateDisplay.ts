import { readDateFormatChoice, type DateFormatChoice } from './dateFormatPreference';
import { getSystemLocale } from './dateLocale';
import type { ISODate } from './types';

/**
 * The single source of truth for every user-visible "rendered date label" in Clutter. Three day styles and
 * one timestamp style — nothing else formats a date for display — all following two inputs: the user's
 * **Date format** preference (`dateFormatPreference.ts`) and the **system locale** (`dateLocale.ts`).
 *
 * The preference chooses how a date reads:
 * - `relative` (default) — `Today`/`Tomorrow`/`Yesterday`, then the abbreviated weekday and date (`Thu, 22 Oct`) for the next five days
 *   (day +2 to +6: each weekday name occurs once in the coming week, and none can mean "last Friday"),
 *   otherwise the `short` date.
 * - `full` — the locale's natural long date (`20 August`, `August 20`), without the relative words.
 * - `short` — the locale's abbreviated date (`20 Oct`).
 * - `weekday` — the abbreviated weekday, then the abbreviated date (`Tue, 20 Oct`, `Tue, Oct 20`; the locale's
 *   own short weekday and date order).
 * - `mdy` / `dmy` / `ymd` — numeric and zero-padded (`10/20/2026`, `20/10/2026`, `2026/10/20`).
 *
 * **The year rule:** a date in the current local calendar year (the reference date's, never UTC's) leaves the
 * year off in every named-month format above — `20 October`, `Tue, 20 Oct` — and any other year keeps it
 * (`20 October 2025`, `Mon, 20 Oct 2025`). The numeric formats always show it, in any year.
 *
 * The style says where the date is shown:
 * - `'heading'` — a Daily Note's title, everywhere it is shown (`formatDailyNoteTitle`). Under `relative`: `Today, 20 August` or `Sat, 22 August`; under any other choice, the date exactly as chosen.
 * - `'long'` — a date inside content and detail views (mentions, properties, collection columns): the
 *   chosen format.
 * - `'short'` — the Tasks sidebar due badge only, the one **documented exception**: a row there has no room
 *   for a chosen format, so it always shows the locale's compact `22 Aug` (`5 Mar 27` in another year), and
 *   `Today`/`Tomorrow`/`Yesterday` for those days, whatever the preference.
 *
 * `formatAbsoluteDate` is a date without the relative words, for a label that must name the day itself (a
 * breadcrumb, the archived banner). The calendar's own chrome (month and year titles, the day number, the
 * weekday header) is `formatDate` in `format.ts`: locale-aware, but not part of the preference.
 *
 * Date-only values (`YYYY-MM-DD`) are calendar dates: they are built from their own numbers into a local
 * `Date` and formatted without any timezone conversion, so they can never land on the neighbouring day.
 * Display only — parsing, storage, Daily Note paths and task dates never come through here.
 *
 * Deliberately separate from `getDateSuggestions`/`resolveDateQuery` (the Date autocomplete's resolver):
 * those turn a query still being typed into a date; this formats an already-resolved one.
 */
export type DateDisplayStyle = 'heading' | 'long' | 'short';

/** Overrides for one call: tests and callers that must not depend on the user's settings or machine. */
export interface DateDisplayOptions {
  /** A BCP 47 locale (`en-IN`). Defaults to the system's. */
  readonly locale?: string;
  /** Defaults to the user's saved Date format preference. */
  readonly format?: DateFormatChoice;
}

/** Month names for typed-input parsing (`parseDateInput`); display goes through `Intl`. */
export const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The coming days that read as a weekday name under `relative`: +2 … +6. */
const WEEKDAY_NAME_FIRST_DAY = 2;
const WEEKDAY_NAME_LAST_DAY = 6;

function resolveOptions(options: DateDisplayOptions): { locale: string; format: DateFormatChoice } {
  return { locale: options.locale ?? getSystemLocale(), format: options.format ?? readDateFormatChoice() };
}

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * A formatter for a calendar date, cached per locale and options. It formats in UTC, and `describeDate` hands
 * it the date as UTC midnight: a calendar date has no timezone, so nothing about the machine's zone — or a
 * zone that changes while the app runs — can move it to the neighbouring day (a formatter otherwise keeps the
 * zone it was created in).
 */
function intl(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dateTimeFormats.get(key);

  if (!format) {
    format = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
    dateTimeFormats.set(key, format);
  }

  return format;
}

const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();

function relativeFormat(locale: string, numeric: 'auto' | 'always'): Intl.RelativeTimeFormat {
  const key = `${locale}|${numeric}`;
  let format = relativeFormats.get(key);

  if (!format) {
    format = new Intl.RelativeTimeFormat(locale, { numeric });
    relativeFormats.set(key, format);
  }

  return format;
}

/**
 * Parses `YYYY-MM-DD` into a local-midnight `Date` via numeric-component construction — never
 * `new Date(isoString)`, which is parsed as **UTC** midnight and, west of UTC, lands on the previous day.
 */
function parseISODate(isoDate: ISODate): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

interface DateParts {
  /** The calendar date as UTC midnight, for `intl` (which formats in UTC). */
  readonly date: Date;
  /** Calendar days from the reference day: 0 today, 1 tomorrow, -1 yesterday. */
  readonly diffDays: number;
  readonly day: number;
  readonly month: number;
  readonly year: number;
}

/**
 * Splits `isoDate` into its parts and counts calendar days from `referenceDate`'s local day. The count is
 * rounded, so a 23- or 25-hour day at a daylight-saving change never shifts the result.
 */
function describeDate(isoDate: ISODate, referenceDate: Date): DateParts {
  const local = parseISODate(isoDate);
  const diffDays = Math.round((local.getTime() - startOfLocalDay(referenceDate).getTime()) / MS_PER_DAY);
  const year = local.getFullYear();
  const month = local.getMonth() + 1;
  const day = local.getDate();
  // `Date.UTC` reads a year below 100 as 19xx, so the year is set separately (the day and month are valid in it).
  const date = new Date(Date.UTC(2000, month - 1, day));
  date.setUTCFullYear(year);

  return { date, diffDays, day, month, year };
}

function isNearDay(parts: DateParts): boolean {
  return parts.diffDays >= -1 && parts.diffDays <= 1;
}

/** `Today` / `Tomorrow` / `Yesterday` in the locale, capitalised (`today` in English, `heute` in German). */
function relativeWord(diffDays: number, locale: string): string {
  const word = relativeFormat(locale, 'auto').format(diffDays, 'day');
  return word.charAt(0).toLocaleUpperCase(locale) + word.slice(1);
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

function weekdayShort(parts: DateParts, locale: string): string {
  return intl(locale, { weekday: 'short' }).format(parts.date);
}

/**
 * The date itself in `format`, under the year rule: the named-month formats leave the year off in the reference
 * year; the numeric ones always carry it.
 */
function dateText(parts: DateParts, format: DateFormatChoice, locale: string, referenceYear: number): string {
  const yearIfNotCurrent = parts.year !== referenceYear && { year: 'numeric' as const };

  switch (format) {
    case 'mdy':
      return `${pad2(parts.month)}/${pad2(parts.day)}/${parts.year}`;
    case 'dmy':
      return `${pad2(parts.day)}/${pad2(parts.month)}/${parts.year}`;
    case 'ymd':
      return `${parts.year}/${pad2(parts.month)}/${pad2(parts.day)}`;
    case 'weekday':
      // The weekday, then the locale's own abbreviated date (not one `Intl` call, which in some locales puts a
      // second comma after the month): `Tue, 20 Oct 2026` in en-IN and en-GB, `Tue, Oct 20, 2026` in en-US.
      return `${weekdayShort(parts, locale)}, ${intl(locale, { day: 'numeric', month: 'short', ...yearIfNotCurrent }).format(parts.date)}`;
    case 'short':
    case 'relative':
      return intl(locale, { day: 'numeric', month: 'short', ...yearIfNotCurrent }).format(parts.date);
    case 'full':
      return intl(locale, { day: 'numeric', month: 'long', ...yearIfNotCurrent }).format(parts.date);
  }
}

/** Whether `Today`/`Tomorrow`/`Yesterday` stand in for the date: the relative choice (the default). */
function usesRelativeWords(format: DateFormatChoice): boolean {
  return format === 'relative';
}

/**
 * The date named in full, never replaced by `Today` and the like — for a label that has to say which day it
 * is. Follows the chosen format and the year rule.
 */
export function formatAbsoluteDate(
  isoDate: ISODate,
  referenceDate: Date = new Date(),
  options: DateDisplayOptions = {}
): string {
  const { locale, format } = resolveOptions(options);

  return dateText(describeDate(isoDate, referenceDate), format, locale, referenceDate.getFullYear());
}

/**
 * Formats `isoDate` for display in one of the three styles (see this module's doc comment).
 * `referenceDate` defaults to real local "now"; a parameter only so callers and tests can pin it.
 */
export function formatDateDisplay(
  isoDate: ISODate,
  style: DateDisplayStyle,
  referenceDate: Date = new Date(),
  options: DateDisplayOptions = {}
): string {
  const { locale, format } = resolveOptions(options);
  const parts = describeDate(isoDate, referenceDate);
  const referenceYear = referenceDate.getFullYear();

  switch (style) {
    case 'heading': {
      if (usesRelativeWords(format)) {
        const identity = isNearDay(parts) ? relativeWord(parts.diffDays, locale) : weekdayShort(parts, locale);
        return `${identity}, ${dateText(parts, 'full', locale, referenceYear)}`;
      }

      return dateText(parts, format, locale, referenceYear);
    }

    case 'long': {
      if (usesRelativeWords(format) && isNearDay(parts)) {
        return relativeWord(parts.diffDays, locale);
      }

      if (
        format === 'relative' &&
        parts.diffDays >= WEEKDAY_NAME_FIRST_DAY &&
        parts.diffDays <= WEEKDAY_NAME_LAST_DAY
      ) {
        return dateText(parts, 'weekday', locale, referenceYear);
      }

      return dateText(parts, format, locale, referenceYear);
    }

    case 'short': {
      // The Tasks sidebar's exception: compact whatever the chosen format (see the module comment).
      if (isNearDay(parts)) {
        return relativeWord(parts.diffDays, locale);
      }

      return intl(locale, {
        day: 'numeric',
        month: 'short',
        ...(parts.year !== referenceYear && { year: '2-digit' }),
      }).format(parts.date);
    }
  }
}

/**
 * The local time of day of `date` in the locale's own clock (`9:05 AM`, `09:05`). Built per call, never cached:
 * an instant is shown in the machine's current timezone, which a cached formatter would keep from the past.
 */
export function formatTimeDisplay(date: Date, options: DateDisplayOptions = {}): string {
  const { locale } = resolveOptions(options);

  return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(date);
}

/**
 * Formats a full timestamp (an instant, not a calendar date) for a surface that shows both when and what
 * time — the collection `created`/`updated` columns and the property list. The date half is local-calendar-day
 * based (`Date`'s local getters, so a late-evening instant never lands on the adjacent UTC day) and follows the
 * chosen format and the year rule; the time half is
 * `formatTimeDisplay`'s, joined with `", "`.
 */
export function formatDateTimeDisplay(
  date: Date,
  referenceDate: Date = new Date(),
  options: DateDisplayOptions = {}
): string {
  const { locale, format } = resolveOptions(options);
  const isoDate = [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  const parts = describeDate(isoDate, referenceDate);
  const dayLabel =
    usesRelativeWords(format) && isNearDay(parts)
      ? relativeWord(parts.diffDays, locale)
      : dateText(parts, format, locale, referenceDate.getFullYear());

  return `${dayLabel}, ${formatTimeDisplay(date, options)}`;
}

/** Beyond this age a timestamp reads as an absolute date/time, not "N ago". */
const RELATIVE_TIMESTAMP_MAX_MS = 2 * 60 * 60 * 1000;

/**
 * `formatDateTimeDisplay`, except a timestamp under two hours old reads as a relative age — `Just now`,
 * `5 minutes ago`, `1 hour ago` (the locale's own wording). The window is deliberately short: labels are
 * formatted once rather than ticking, so the longer a relative label could stay on screen the more stale it
 * could get, and past a couple of hours `Today, 09:03` is the more useful answer anyway. Anything older, or a
 * future instant (clock skew), falls through to the absolute label.
 */
export function formatRelativeTimestamp(
  date: Date,
  referenceDate: Date = new Date(),
  options: DateDisplayOptions = {}
): string {
  const ageMs = referenceDate.getTime() - date.getTime();

  if (ageMs >= 0 && ageMs < RELATIVE_TIMESTAMP_MAX_MS) {
    const { locale } = resolveOptions(options);
    const minutes = Math.floor(ageMs / 60_000);

    if (minutes < 1) {
      return locale.toLowerCase().startsWith('en')
        ? 'Just now'
        : relativeFormat(locale, 'auto').format(0, 'second');
    }

    return minutes < 60
      ? relativeFormat(locale, 'always').format(-minutes, 'minute')
      : relativeFormat(locale, 'always').format(-Math.floor(minutes / 60), 'hour');
  }

  return formatDateTimeDisplay(date, referenceDate, options);
}

/** The day every Date format example is shown with: Tuesday, 20 October 2026. */
const EXAMPLE_DATE: ISODate = '2026-10-20';

/**
 * What a Date format option looks like, for the Settings menu: the example date written by `formatDateDisplay`
 * itself, in the system locale (or `locale`), so it can never drift from what the app shows. Each option is
 * shown in its typical form — the named-month formats that carry a year show one (`20 October 2026`,
 * `Tue, 20 Oct 2026`), `short` shows the current-year form without it (`20 Oct`), the numeric formats always
 * have it. That is done by choosing the reference "today" the example is formatted against, not by a separate
 * layout: a year is shown exactly when the year rule would show it.
 */
export function formatDateFormatExample(format: DateFormatChoice, options: { locale?: string } = {}): string {
  const sameYear = new Date(2026, 0, 15);
  const otherYear = new Date(2025, 0, 15);
  const reference = format === 'short' ? sameYear : format === 'relative' ? new Date(2026, 9, 20) : otherYear;

  return formatDateDisplay(EXAMPLE_DATE, 'long', reference, { locale: options.locale, format });
}
