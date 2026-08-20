import { describe, expect, it } from 'vitest';

import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from './math';

describe('math', () => {
  it('addDays crosses a month and year boundary without drifting a day via toDate', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('addWeeks composes onto addDays', () => {
    expect(addWeeks('2026-08-20', 1)).toBe('2026-08-27');
  });

  it('addMonths clamps via native Date rollover semantics at a shorter month', () => {
    // Jan 31 + 1 month rolls into March 3 (Feb 2026 has 28 days) — native
    // Date.setMonth behavior, not a bug in addMonths itself; documented here
    // so a future change to this semantic is a deliberate one.
    expect(addMonths('2026-01-31', 1)).toBe('2026-03-03');
    expect(addMonths('2026-08-20', 12)).toBe('2027-08-20');
  });

  it('startOfWeek/endOfWeek bound a Sunday-start week, including across a month boundary', () => {
    // 2026-08-20 is a Thursday.
    expect(startOfWeek('2026-08-20')).toBe('2026-08-16');
    expect(endOfWeek('2026-08-20')).toBe('2026-08-22');
    // 2026-08-01 is a Saturday — its week starts in July.
    expect(startOfWeek('2026-08-01')).toBe('2026-07-26');
  });

  it('startOfMonth/endOfMonth are exact at year boundaries', () => {
    expect(startOfMonth('2026-08-20')).toBe('2026-08-01');
    expect(endOfMonth('2026-08-20')).toBe('2026-08-31');
    expect(endOfMonth('2026-12-15')).toBe('2026-12-31');
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
  });
});
