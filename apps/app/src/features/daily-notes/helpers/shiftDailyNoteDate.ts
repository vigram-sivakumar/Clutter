/**
 * The ISO date (`YYYY-MM-DD`, the Daily Note's own name) `days` after `iso`, or before it when negative. Calendar
 * arithmetic in UTC, so a daylight-saving change never moves it by a day.
 */
export function shiftDailyNoteDate(iso: string, days: number): string {
  const [year = 0, month = 1, day = 1] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Today's date, as the Daily Note's ISO name, in the user's own time zone. */
export function todayAsDailyNoteDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
