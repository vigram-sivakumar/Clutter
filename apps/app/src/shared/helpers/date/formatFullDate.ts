/**
 * Converts an ISO date (YYYY-MM-DD)
 * into "Day Month Year".
 *
 * Example:
 * 2026-07-19 → 19 July 2026
 */
export function formatFullDate(date: string): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
