import { formatDateDisplay, formatRelativeTimestamp } from '@shared/helpers/time/dateDisplay';
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
 * Display string for a raw `date` Property value. A date-only value goes
 * through the shared date-label helper (`'condensedFullYear'` —
 * `Today`/`Tomorrow`/`Yesterday`, else `11 Nov 2026`); a timestamp (the
 * system Created / Last edited values) goes through
 * `formatRelativeTimestamp` — the same `35 minutes ago` / `Today, 09:03 AM`
 * / `12 Aug, 09:03 AM` label the collection views show. Display only; the
 * raw value stays the canonical one. An unparseable value is shown raw
 * rather than hidden.
 */
export function formatDatePropertyValue(raw: string, referenceDate: Date = new Date()): string {
  const parsed = parseDatePropertyValue(raw);

  if (!parsed) {
    return raw;
  }

  return parsed.dateTime
    ? formatRelativeTimestamp(parsed.dateTime, referenceDate)
    : formatDateDisplay(parsed.isoDate, 'condensedFullYear', referenceDate);
}
