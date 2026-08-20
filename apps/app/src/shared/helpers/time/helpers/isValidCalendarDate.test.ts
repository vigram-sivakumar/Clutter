import { describe, expect, it } from 'vitest';

import { isValidCalendarDate } from './isValidCalendarDate';

describe('isValidCalendarDate', () => {
  it('accepts a genuine calendar date', () => {
    expect(isValidCalendarDate('2026-08-20')).toBe(true);
  });

  it('accepts a leap-day date in a leap year', () => {
    expect(isValidCalendarDate('2024-02-29')).toBe(true);
  });

  it('rejects a leap-day date in a non-leap year — rollover would silently become March 1', () => {
    expect(isValidCalendarDate('2026-02-29')).toBe(false);
  });

  it('rejects an out-of-range month', () => {
    expect(isValidCalendarDate('2026-13-01')).toBe(false);
  });

  it('rejects an out-of-range day', () => {
    expect(isValidCalendarDate('2026-08-45')).toBe(false);
  });

  it('rejects a day that would roll over into the next month', () => {
    expect(isValidCalendarDate('2026-04-31')).toBe(false);
  });

  it('rejects malformed shapes entirely', () => {
    expect(isValidCalendarDate('2026-8-20')).toBe(false);
    expect(isValidCalendarDate('not-a-date')).toBe(false);
    expect(isValidCalendarDate('')).toBe(false);
  });
});
