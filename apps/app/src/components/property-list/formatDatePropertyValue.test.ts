import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DateFormatChoice } from '@shared/helpers/time/dateFormatPreference';
import { formatDatePropertyValue, parseDatePropertyValue } from './formatDatePropertyValue';

// Which Date format the formatter reads for the test in hand. These tests are about how a Date property is written
// in a specific format, so each says which one; none leans on the global default.
const preference = vi.hoisted(() => ({ format: 'full' as DateFormatChoice }));
vi.mock('@shared/helpers/time/dateFormatPreference', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/helpers/time/dateFormatPreference')>()),
  readDateFormatChoice: () => preference.format,
}));
beforeEach(() => {
  preference.format = 'full';
});

// Thursday, 2 Oct 2026 — local time, so assertions hold in any timezone.
const NOW = new Date(2026, 9, 2, 12, 0);

describe('parseDatePropertyValue', () => {
  it('keeps a YYYY-MM-DD date as the local day, with no time', () => {
    expect(parseDatePropertyValue('2026-09-15')).toEqual({ isoDate: '2026-09-15', dateTime: null });
  });

  it('resolves an ISO timestamp to the local day and moment it denotes', () => {
    const moment = new Date(2026, 8, 15, 9, 36);
    const parsed = parseDatePropertyValue(moment.toISOString());

    expect(parsed?.isoDate).toBe('2026-09-15');
    expect(parsed?.dateTime?.getTime()).toBe(moment.getTime());
  });

  it('returns null for a value that is not a date', () => {
    expect(parseDatePropertyValue('not-a-date')).toBeNull();
  });
});

describe('formatDatePropertyValue', () => {
  it("formats a date through formatDateDisplay's 'long' style, in the Full date format: no relative words", () => {
    preference.format = 'full';

    expect(formatDatePropertyValue('2026-10-02', NOW)).toBe('2 October');
    expect(formatDatePropertyValue('2026-09-30', NOW)).toBe('30 September');
    expect(formatDatePropertyValue('2026-11-11', NOW)).toBe('11 November');
    expect(formatDatePropertyValue('2025-09-15', NOW)).toBe('15 September 2025');
  });

  it("formats a date in the Relative format: Today and Yesterday by name, the short date otherwise", () => {
    preference.format = 'relative';

    expect(formatDatePropertyValue('2026-10-02', NOW)).toBe('Today');
    expect(formatDatePropertyValue('2026-10-01', NOW)).toBe('Yesterday');
    expect(formatDatePropertyValue('2026-11-11', NOW)).toBe('11 Nov');
    expect(formatDatePropertyValue('2025-09-15', NOW)).toMatch(/^15 Sep(t)? 2025$/);
  });

  it("formats a timestamp through formatRelativeTimestamp (relative under 2 hours, else date and time), in the Full date format", () => {
    preference.format = 'full';

    expect(formatDatePropertyValue(new Date(NOW.getTime() - 35 * 60_000).toISOString(), NOW)).toBe(
      '35 minutes ago'
    );
    expect(formatDatePropertyValue(new Date(2026, 10, 11, 20, 20).toISOString(), NOW)).toBe(
      '11 November, 8:20 pm'
    );
    expect(formatDatePropertyValue(new Date(2025, 10, 11, 20, 20).toISOString(), NOW)).toBe(
      '11 November 2025, 8:20 pm'
    );
    expect(formatDatePropertyValue(new Date(2026, 9, 1, 9, 5).toISOString(), NOW)).toBe(
      '1 October, 9:05 am'
    );
  });

  it('formats a timestamp in the Relative format: Yesterday by name, then the time', () => {
    preference.format = 'relative';

    expect(formatDatePropertyValue(new Date(2026, 9, 1, 9, 5).toISOString(), NOW)).toBe('Yesterday, 9:05 am');
    expect(formatDatePropertyValue(new Date(2026, 10, 11, 20, 20).toISOString(), NOW)).toBe('11 Nov, 8:20 pm');
  });

  it('shows an unparseable value raw rather than hiding it', () => {
    expect(formatDatePropertyValue('not-a-date', NOW)).toBe('not-a-date');
  });
});
