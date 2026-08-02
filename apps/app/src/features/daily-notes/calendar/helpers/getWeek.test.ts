import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getWeek } from './getWeek';
import { toISODate } from '@shared/helpers/time/helpers/toISODate';

describe('getWeek', () => {
  beforeEach(() => {
    // Wednesday, July 15, 2026 — mid-week, so the week spans both the
    // previous and next few days without touching a month boundary.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the 7 days of the week containing the visible date, starting on Sunday', () => {
    const week = getWeek('2026-07-15', '2026-07-15');

    expect(week).toHaveLength(7);
    expect(week.map((day) => day.date)).toEqual([12, 13, 14, 15, 16, 17, 18]);
    expect(week[0]!.fullDate).toBe('2026-07-12');
    expect(week[6]!.fullDate).toBe('2026-07-18');
  });

  it('marks only the current real-world date as today', () => {
    const week = getWeek('2026-07-15', '2026-07-15');

    expect(week.filter((day) => day.isToday)).toHaveLength(1);
    expect(week.find((day) => day.isToday)?.fullDate).toBe('2026-07-15');
  });

  it('marks only the selected date as selected, independent of the visible date', () => {
    const week = getWeek('2026-07-15', '2026-07-13');

    const selected = week.filter((day) => day.isSelected);
    expect(selected).toHaveLength(1);
    expect(selected[0]!.fullDate).toBe('2026-07-13');
  });

  it('never marks a week-view day as outside the month', () => {
    const week = getWeek('2026-07-15', '2026-07-15');

    expect(week.every((day) => day.isOutsideMonth === false)).toBe(true);
  });

  it('follows the visible date into the next week even when it differs from the selected date', () => {
    const nextWeekVisible = toISODate(new Date(2026, 6, 22));
    const week = getWeek(nextWeekVisible, '2026-07-15');

    expect(week[0]!.fullDate).toBe('2026-07-19');
    expect(week.some((day) => day.isSelected)).toBe(false);
  });

  it('marks no day as selected when selectedDate is undefined, including today', () => {
    const week = getWeek('2026-07-15', undefined);

    expect(week.some((day) => day.isSelected)).toBe(false);
    expect(week.some((day) => day.isToday)).toBe(true);
  });
});
