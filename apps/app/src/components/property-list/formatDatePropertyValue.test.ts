import { describe, expect, it } from 'vitest';

import { formatDatePropertyValue, parseDatePropertyValue } from './formatDatePropertyValue';

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
  it("formats a date through formatDateDisplay's 'condensed' mode", () => {
    expect(formatDatePropertyValue('2026-09-15', NOW)).toBe('15 Sep');
    expect(formatDatePropertyValue('2025-09-15', NOW)).toBe('15 Sep 2025');
    expect(formatDatePropertyValue('2026-10-02', NOW)).toBe('Today');
  });

  it('appends the local time for a timestamp', () => {
    const value = new Date(2026, 8, 15, 9, 36).toISOString();

    expect(formatDatePropertyValue(value, NOW)).toBe('15 Sep, 9:36 AM');
  });

  it('shows an unparseable value raw rather than hiding it', () => {
    expect(formatDatePropertyValue('not-a-date', NOW)).toBe('not-a-date');
  });
});
