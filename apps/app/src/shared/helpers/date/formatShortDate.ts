/**
 * Formats a date using a short month.
 *
 * Current year:
 * 2026-07-12 → 12 Jul
 *
 * Different year:
 * 2025-12-25 → 25 Dec 2025
 */
export function formatShortDate(date: string): string {
  const value = new Date(date);
  const currentYear = new Date().getFullYear();

  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
  };

  if (value.getFullYear() !== currentYear) {
    options.year = 'numeric';
  }

  return value.toLocaleDateString('en-UK', options);
}
