import { MONTH_LABELS } from './dateDisplay';
import { isValidCalendarDate } from './helpers/isValidCalendarDate';
import { toISODate } from './helpers/toISODate';
import type { ISODate } from './types';

const NUMERIC_DMY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;
const ISO_YMD = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const TEXTUAL_DMY = /^(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{2}|\d{4})$/;

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

function toYear(token: string): number {
  const year = Number(token);
  return token.length === 2 ? expandTwoDigitYear(year) : year;
}

/** A full month name, or an unambiguous prefix of one (≥ 3 letters): `sep`, `sept`, `september`. */
function monthFromWord(word: string): number | null {
  if (word.length < 3) {
    return null;
  }

  const index = MONTH_LABELS.findIndex((label) => label.toLowerCase().startsWith(word));
  return index === -1 ? null : index + 1;
}

function buildISODate(year: number, month: number, day: number): ISODate | null {
  const isoDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isValidCalendarDate(isoDate) ? isoDate : null;
}

/**
 * Parses a typed date into a local `YYYY-MM-DD`, or null when the text
 * isn't (yet) a complete, real date — the caller keeps the text as typed.
 * Deliberately closed grammar, day-before-month (the app's `en-IN`
 * convention):
 * - numeric `D/M/Y` with `/`, `-` or `.`, unpadded or zero-padded, and a
 *   2- or 4-digit year (`1/9/26`, `01-09-2026`, `15.9.2026`);
 * - ISO `YYYY-MM-DD`;
 * - `D Month Y` with a full or abbreviated month name (`15 Sep 2026`,
 *   `15 September 2026`);
 * - `Today` / `Tomorrow` / `Yesterday`, relative to `referenceDate` — so
 *   every label the Property date formatter displays parses back.
 */
export function parseDateInput(input: string, referenceDate: Date = new Date()): ISODate | null {
  const text = input.trim().toLowerCase();

  const offset = RELATIVE_DAY_OFFSETS[text];
  if (offset !== undefined) {
    const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() + offset);
    return toISODate(date);
  }

  const iso = ISO_YMD.exec(text);
  if (iso) {
    return buildISODate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const numeric = NUMERIC_DMY.exec(text);
  if (numeric) {
    return buildISODate(toYear(numeric[3]!), Number(numeric[2]), Number(numeric[1]));
  }

  const textual = TEXTUAL_DMY.exec(text);
  if (textual) {
    const month = monthFromWord(textual[2]!);
    return month === null ? null : buildISODate(toYear(textual[3]!), month, Number(textual[1]));
  }

  return null;
}
