import { describe, expect, it } from 'vitest';

import { formatDate } from './format';

// The calendar's own pieces (a day number, month names, the year), in the system locale or the one passed.
// They are not part of the Date format preference.
describe.each([
  ['en-IN', '5', 'March', 'Mar 2027', '2027'],
  ['en-US', '5', 'March', 'Mar 2027', '2027'],
  ['en-GB', '5', 'March', 'Mar 2027', '2027'],
  ['de-DE', '5', 'März', 'März 2027', '2027'],
])('formatDate in %s', (locale, day, monthLong, monthYear, year) => {
  it('writes each piece in the locale', () => {
    expect(formatDate('2027-03-05', 'date', locale)).toBe(day);
    expect(formatDate('2027-03-05', 'monthLong', locale)).toBe(monthLong);
    expect(formatDate('2027-03-05', 'monthYear', locale)).toBe(monthYear);
    expect(formatDate('2027-03-05', 'year', locale)).toBe(year);
  });
});

describe('formatDate', () => {
  it('follows the system locale when none is given', async () => {
    const { setSystemLocaleOverride } = await import('./dateLocale');
    setSystemLocaleOverride('de-DE');
    expect(formatDate('2027-03-05', 'monthLong')).toBe('März');
    setSystemLocaleOverride('en-IN');
    expect(formatDate('2027-03-05', 'monthLong')).toBe('March');
  });

  it('keeps a date-only value on its own day, on the first and last day of a month and year', () => {
    expect(formatDate('2026-08-01', 'date', 'en-IN')).toBe('1');
    expect(formatDate('2026-12-31', 'date', 'en-IN')).toBe('31');
    expect(formatDate('2026-01-01', 'monthLong', 'en-IN')).toBe('January');
    expect(formatDate('2028-02-29', 'date', 'en-IN')).toBe('29');
  });
});
