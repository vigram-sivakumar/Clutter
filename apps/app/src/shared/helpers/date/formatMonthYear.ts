/**
 * Converts an ISO date (YYYY-MM-DD) or month (YYYY-MM)
 * into "Month Year".
 *
 * Examples:
 * formatMonthYear('2026-07')           → July 2026
 * formatMonthYear('2026-07', 'short')  → Jul 2026
 */
export function formatMonthYear(
  date: string,
  style: 'long' | 'short' = 'long'
): string {
  const value = date.length === 7 ? `${date}-01` : date;

  return new Date(value).toLocaleDateString('en-UK', {
    month: style,
    year: 'numeric',
  });
}
