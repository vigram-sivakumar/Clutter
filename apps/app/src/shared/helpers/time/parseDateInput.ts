import { MONTH_LABELS } from './dateDisplay';
import { isValidCalendarDate } from './helpers/isValidCalendarDate';
import { toISODate } from './helpers/toISODate';
import type { ISODate } from './types';

/** Separators are not significant: any run of these splits the input into parts. */
const SEPARATORS = /[\s./,-]+/;

const RELATIVE_DAY_OFFSETS: Readonly<Record<string, number>> = {
  today: 0,
  tomorrow: 1,
  yesterday: -1,
};

/**
 * Two-digit years follow the POSIX `strptime` `%y` convention:
 * `00`–`68` → 2000–2068, `69`–`99` → 1969–1999. Fixed rather than
 * relative to "now", so the same input always means the same date.
 */
export function expandTwoDigitYear(year: number): number {
  return year <= 68 ? 2000 + year : 1900 + year;
}

const isDayOrMonthNumber = (part: string) => /^\d{1,2}$/.test(part);
const isWord = (part: string) => /^[a-z]+$/.test(part);

/** A 2- or 4-digit year; anything else (`2`, `202`) is still being typed. */
function toYear(part: string): number | null {
  if (/^\d{4}$/.test(part)) {
    return Number(part);
  }
  if (/^\d{2}$/.test(part)) {
    return expandTwoDigitYear(Number(part));
  }
  return null;
}

/**
 * A full month name or any prefix of one that matches only that month —
 * `feb`, `f`, `sept`, `september` — else null (`ma` could be March or May).
 */
function monthFromWord(word: string): number | null {
  const matches = MONTH_LABELS.flatMap((label, index) =>
    label.toLowerCase().startsWith(word) ? [index + 1] : []
  );
  return matches.length === 1 ? matches[0]! : null;
}

/** A month part: a 1–2 digit number or a month word. */
function toMonth(part: string): number | null {
  if (isDayOrMonthNumber(part)) {
    return Number(part);
  }
  return isWord(part) ? monthFromWord(part) : null;
}

function buildISODate(year: number, month: number, day: number): ISODate | null {
  const isoDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isValidCalendarDate(isoDate) ? isoDate : null;
}

/**
 * Day-first: `D`, `D M`, `D M Y`. A missing month/year comes from
 * `referenceDate` — `01` is the 1st of the current month, `01 02` is
 * 1 February this year.
 */
function parseDayFirst(parts: readonly string[], referenceDate: Date): ISODate | null {
  const [dayPart, monthPart, yearPart] = parts;

  if (!dayPart || !isDayOrMonthNumber(dayPart)) {
    return null;
  }

  const month = monthPart === undefined ? referenceDate.getMonth() + 1 : toMonth(monthPart);
  const year = yearPart === undefined ? referenceDate.getFullYear() : toYear(yearPart);

  if (month === null || year === null) {
    return null;
  }

  return buildISODate(year, month, Number(dayPart));
}

/**
 * Month-name-first: `Mon`, `Mon D`, `Mon Y`, `Mon D Y`. A month alone means
 * its 1st; a 4-digit number straight after the month is a year, a 1–2
 * digit one is a day.
 */
function parseMonthFirst(parts: readonly string[], referenceDate: Date): ISODate | null {
  const [monthPart, second, third] = parts;
  const month = monthPart ? monthFromWord(monthPart) : null;

  if (month === null) {
    return null;
  }

  if (second === undefined) {
    return buildISODate(referenceDate.getFullYear(), month, 1);
  }

  if (/^\d{4}$/.test(second) && third === undefined) {
    return buildISODate(Number(second), month, 1);
  }

  if (!isDayOrMonthNumber(second)) {
    return null;
  }

  const year = third === undefined ? referenceDate.getFullYear() : toYear(third);
  return year === null ? null : buildISODate(year, month, Number(second));
}

/**
 * Interprets typed date text as a local `YYYY-MM-DD` whenever it can be
 * read as one — complete or partial — else null (the caller keeps the
 * text as typed and leaves the calendar where it was). Separators are not
 * significant: `.`, `/`, `-`, `,` and whitespace are interchangeable.
 * Accepted, day before month (the app's `en-IN` convention):
 * - `D` → that day of `referenceDate`'s month; `D M` → this year;
 *   `D M Y` with a 2- or 4-digit year — the month as a number or a name
 *   (`1 feb 26`, `01.feb.2026`, `15/09/2026`);
 * - a month name first: `feb` (its 1st, this year), `feb 1`, `feb 2026`,
 *   `feb 1 2026`;
 * - ISO `YYYY-MM-DD`;
 * - `Today` / `Tomorrow` / `Yesterday` — so every label the Property date
 *   formatter displays parses back.
 * Month names may be full or any prefix unique to one month.
 */
export function parseDateInput(input: string, referenceDate: Date = new Date()): ISODate | null {
  const text = input.trim().toLowerCase();

  const offset = RELATIVE_DAY_OFFSETS[text];
  if (offset !== undefined) {
    const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() + offset);
    return toISODate(date);
  }

  const parts = text.split(SEPARATORS).filter((part) => part !== '');

  if (parts.length === 0 || parts.length > 3) {
    return null;
  }

  const [first] = parts;

  if (/^\d{4}$/.test(first!)) {
    // ISO, year first: only the complete Y M D form.
    const [, monthPart, dayPart] = parts;
    return parts.length === 3 && isDayOrMonthNumber(monthPart!) && isDayOrMonthNumber(dayPart!)
      ? buildISODate(Number(first), Number(monthPart), Number(dayPart))
      : null;
  }

  return isWord(first!) ? parseMonthFirst(parts, referenceDate) : parseDayFirst(parts, referenceDate);
}
