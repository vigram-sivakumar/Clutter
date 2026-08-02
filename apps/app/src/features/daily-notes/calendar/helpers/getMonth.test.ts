import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMonth } from './getMonth';

describe('getMonth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('always returns 6 weeks of 7 days', () => {
    const weeks = getMonth('2026-07-15', '2026-07-15');

    expect(weeks).toHaveLength(6);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it('marks days from the previous/next month as outside the visible month', () => {
    // July 2026 starts on a Wednesday, so the first week's Sun/Mon/Tue
    // cells belong to June.
    const weeks = getMonth('2026-07-15', '2026-07-15');
    const firstWeek = weeks[0]!;

    expect(firstWeek.slice(0, 3).every((day) => day.isOutsideMonth)).toBe(true);
    expect(firstWeek.slice(3).every((day) => day.isOutsideMonth === false)).toBe(
      true
    );
  });

  it('marks every in-month day as not outside the month', () => {
    const weeks = getMonth('2026-07-15', '2026-07-15');
    const allDays = weeks.flat();
    const julyDays = allDays.filter((day) => day.fullDate.startsWith('2026-07'));

    expect(julyDays).toHaveLength(31);
    expect(julyDays.every((day) => day.isOutsideMonth === false)).toBe(true);
  });

  it('marks only the current real-world date as today', () => {
    const allDays = getMonth('2026-07-15', '2026-07-15').flat();

    expect(allDays.filter((day) => day.isToday)).toHaveLength(1);
    expect(allDays.find((day) => day.isToday)?.fullDate).toBe('2026-07-15');
  });

  it('marks only the selected date as selected, including an outside-month day', () => {
    const allDays = getMonth('2026-07-15', '2026-06-29').flat();

    const selected = allDays.filter((day) => day.isSelected);
    expect(selected).toHaveLength(1);
    expect(selected[0]!.fullDate).toBe('2026-06-29');
    expect(selected[0]!.isOutsideMonth).toBe(true);
  });

  it('marks no day as selected when selectedDate is undefined, including today', () => {
    const allDays = getMonth('2026-07-15', undefined).flat();

    expect(allDays.some((day) => day.isSelected)).toBe(false);
    expect(allDays.some((day) => day.isToday)).toBe(true);
  });
});
