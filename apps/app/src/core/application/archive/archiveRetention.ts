/**
 * How long an archived item is kept before automatic cleanup may delete it (Settings → Preferences → Data &
 * storage → Automatically delete archived items): 30 calendar days, fixed.
 */
export const ARCHIVE_RETENTION_DAYS = 30;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` of `date` in the machine's local calendar. */
export function toLocalIsoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The local calendar date (`YYYY-MM-DD`) an item was archived on, from the `archivedAt` Clutter recorded when it
 * archived it — a timestamp (`2026-09-20T22:30:00.000Z`) or an already-plain date. Anything else — missing (an
 * item put in `Archive/` from outside Clutter has no provenance), blank, unparsable or not a real date — is `null`:
 * the archive date is never guessed, and never taken from a creation or modification time.
 */
export function archiveDateOf(archivedAt: string | null | undefined): string | null {
  if (typeof archivedAt !== 'string' || archivedAt.trim() === '') {
    return null;
  }

  const value = archivedAt.trim();
  const plain = DATE_ONLY.exec(value);

  if (plain) {
    const [, year, month, day] = plain;
    const check = new Date(Number(year), Number(month) - 1, Number(day));
    const real =
      check.getFullYear() === Number(year) &&
      check.getMonth() === Number(month) - 1 &&
      check.getDate() === Number(day);

    return real ? value : null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : toLocalIsoDate(parsed);
}

/** Whole calendar days from `from` to `to` (both `YYYY-MM-DD`), counted on the calendar — a 23- or 25-hour day is still one day. */
function calendarDaysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];

  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/**
 * Whether an item archived at `archivedAt` has been archived for at least `ARCHIVE_RETENTION_DAYS` calendar days
 * on `now`'s local calendar: archived on 1 January, it is eligible from 31 January (30 days later). An item with
 * no usable archive date is never eligible, and neither is one whose date lies in the future (a clock set back).
 */
export function isArchiveRetentionElapsed(archivedAt: string | null | undefined, now: Date): boolean {
  const archivedOn = archiveDateOf(archivedAt);

  return archivedOn !== null && calendarDaysBetween(archivedOn, toLocalIsoDate(now)) >= ARCHIVE_RETENTION_DAYS;
}
