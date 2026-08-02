import { describe, expect, it } from 'vitest';

import { moveCalendar } from './moveCalendar';

describe('moveCalendar', () => {
  it('moves forward by 7 days in week mode', () => {
    expect(moveCalendar('2026-07-15', 'next', 'week')).toBe('2026-07-22');
  });

  it('moves backward by 7 days in week mode', () => {
    expect(moveCalendar('2026-07-15', 'previous', 'week')).toBe('2026-07-08');
  });

  it('moves forward by 1 month in month mode', () => {
    expect(moveCalendar('2026-07-15', 'next', 'month')).toBe('2026-08-15');
  });

  it('moves backward by 1 month in month mode', () => {
    expect(moveCalendar('2026-07-15', 'previous', 'month')).toBe('2026-06-15');
  });

  it('crosses a year boundary correctly in month mode', () => {
    expect(moveCalendar('2026-12-15', 'next', 'month')).toBe('2027-01-15');
    expect(moveCalendar('2026-01-15', 'previous', 'month')).toBe('2025-12-15');
  });
});
