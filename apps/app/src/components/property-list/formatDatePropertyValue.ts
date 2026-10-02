import { formatDateDisplay, formatTimeDisplay } from '@shared/helpers/time/dateDisplay';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';
import type { ISODate } from '@shared/helpers/time/types';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface ParsedDatePropertyValue {
  /** The local calendar day — what the Calendar selects and displays. */
  readonly isoDate: ISODate;
  /** The local moment, only when the raw value carried a time (a timestamp). */
  readonly dateTime: Date | null;
}

/**
 * Reads a raw `date` Property value: a local `YYYY-MM-DD` date stays as-is
 * (never `new Date(isoString)`, which would parse it as UTC midnight); a
 * full ISO timestamp is resolved to the local day and time it denotes.
 * Returns null for a value that is neither.
 */
export function parseDatePropertyValue(raw: string): ParsedDatePropertyValue | null {
  if (ISO_DATE_PATTERN.test(raw)) {
    return { isoDate: raw, dateTime: null };
  }

  const dateTime = new Date(raw);

  if (Number.isNaN(dateTime.getTime())) {
    return null;
  }

  return { isoDate: toISODate(dateTime), dateTime };
}

/**
 * Display string for a raw `date` Property value, through the shared
 * date-label helper (`'condensedFullYear'` — `Today`/`Tomorrow`/`Yesterday`,
 * else `11 Nov 2026`), plus `, 08:20 PM` for a timestamp. Display only;
 * the raw value stays the canonical one. An unparseable value is shown raw
 * rather than hidden.
 */
export function formatDatePropertyValue(raw: string, referenceDate: Date = new Date()): string {
  const parsed = parseDatePropertyValue(raw);

  if (!parsed) {
    return raw;
  }

  const date = formatDateDisplay(parsed.isoDate, 'condensedFullYear', referenceDate);

  return parsed.dateTime ? `${date}, ${formatTimeDisplay(parsed.dateTime)}` : date;
}

/**
 * The editable date input's value for a raw `date` Property value —
 * `'numericDotted'` (`02.10.2026`): an absolute date the user can read and
 * edit in place, and what any typed form normalizes back to. An
 * unparseable value is shown raw.
 */
export function formatDatePropertyEditValue(raw: string): string {
  const parsed = parseDatePropertyValue(raw);
  return parsed ? formatDateDisplay(parsed.isoDate, 'numericDotted') : raw;
}
