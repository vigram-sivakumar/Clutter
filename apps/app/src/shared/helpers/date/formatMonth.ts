/**
 * Converts an ISO date (YYYY-MM-DD) or month (YYYY-MM)
 * into the month's name.
 *
 * Examples:
 * formatMonth('2026-07')               → July
 * formatMonth('2026-07', 'short')      → Jul
 */
export function formatMonth(
  date: string,
  style: 'long' | 'short' = 'long'
): string {
  const value = date.length === 7 ? `${date}-01` : date;

  return new Date(value).toLocaleDateString('en-UK', {
    month: style,
  });
}
