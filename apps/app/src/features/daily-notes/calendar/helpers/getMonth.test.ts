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
    expect(
      firstWeek.slice(3).every((day) => day.isOutsideMonth === false)
    ).toBe(true);
  });

  it('marks every in-month day as not outside the month', () => {
    const weeks = getMonth('2026-07-15', '2026-07-15');
    const allDays = weeks.flat();
    const julyDays = allDays.filter((day) =>
      day.fullDate.startsWith('2026-07')
    );

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

  describe('week start', () => {
    const firstColumn = (weeks: ReturnType<typeof getMonth>) =>
      weeks.map((week) => week[0]!.fullDate);
    const inMonth = (weeks: ReturnType<typeof getMonth>, prefix: string) =>
      weeks.flat().filter((day) => day.fullDate.startsWith(prefix));

    it('defaults to Sunday-first', () => {
      expect(getMonth('2026-07-15', undefined)).toEqual(
        getMonth('2026-07-15', undefined, 'sunday')
      );
    });

    it('Sunday-first: every row starts on a Sunday and July 2026 (a Wednesday start) has 3 leading days', () => {
      const weeks = getMonth('2026-07-15', undefined, 'sunday');
      expect(
        weeks.every(
          (week) => new Date(week[0]!.fullDate + 'T00:00').getDay() === 0
        )
      ).toBe(true);
      expect(weeks[0]!.map((day) => day.fullDate)).toEqual([
        '2026-06-28',
        '2026-06-29',
        '2026-06-30',
        '2026-07-01',
        '2026-07-02',
        '2026-07-03',
        '2026-07-04',
      ]);
    });

    it('Monday-first: every row starts on a Monday and July 2026 has 2 leading days', () => {
      const weeks = getMonth('2026-07-15', undefined, 'monday');
      expect(
        weeks.every(
          (week) => new Date(week[0]!.fullDate + 'T00:00').getDay() === 1
        )
      ).toBe(true);
      expect(weeks[0]!.map((day) => day.fullDate)).toEqual([
        '2026-06-29',
        '2026-06-30',
        '2026-07-01',
        '2026-07-02',
        '2026-07-03',
        '2026-07-04',
        '2026-07-05',
      ]);
      expect(weeks[0]!.slice(0, 2).every((day) => day.isOutsideMonth)).toBe(
        true
      );
      expect(weeks[0]!.slice(2).every((day) => !day.isOutsideMonth)).toBe(true);
    });

    it('a month that begins on a Sunday (Feb 2026): no leading days Sunday-first, six Monday-first', () => {
      expect(weeksFirstCell('2026-02-10', 'sunday')).toBe('2026-02-01');
      expect(weeksFirstCell('2026-02-10', 'monday')).toBe('2026-01-26');
      expect(
        getMonth('2026-02-10', undefined, 'monday')[0]!.filter(
          (day) => day.isOutsideMonth
        )
      ).toHaveLength(6);
    });

    it('a month that begins on a Monday (Jun 2026): one leading day Sunday-first, none Monday-first', () => {
      expect(weeksFirstCell('2026-06-10', 'sunday')).toBe('2026-05-31');
      expect(weeksFirstCell('2026-06-10', 'monday')).toBe('2026-06-01');
    });

    it.each(['sunday', 'monday'] as const)(
      'always 6 rows of 7 consecutive days (%s-first)',
      (weekStart) => {
        for (const visible of [
          '2026-02-10',
          '2026-06-10',
          '2026-07-15',
          '2024-02-10',
          '2026-12-31',
          '2026-01-01',
        ]) {
          const flat = getMonth(visible, undefined, weekStart).flat();
          expect(flat).toHaveLength(42);
          flat.slice(1).forEach((day, index) => {
            const previous = new Date(flat[index]!.fullDate + 'T00:00');
            previous.setDate(previous.getDate() + 1);
            expect(day.fullDate).toBe(
              [
                previous.getFullYear(),
                String(previous.getMonth() + 1).padStart(2, '0'),
                String(previous.getDate()).padStart(2, '0'),
              ].join('-')
            );
          });
        }
      }
    );

    it.each([
      ['2024-02-10', '2024-02', 29], // leap-year February
      ['2023-02-10', '2023-02', 28],
      ['2028-02-10', '2028-02', 29],
      ['2026-04-10', '2026-04', 30],
      ['2026-01-10', '2026-01', 31],
    ])(
      'shows every day of %s exactly once, in the month (%s has %i days)',
      (visible, prefix, days) => {
        for (const weekStart of ['sunday', 'monday'] as const) {
          const weeks = getMonth(visible, undefined, weekStart);
          const month = inMonth(weeks, prefix);
          expect(month).toHaveLength(days);
          expect(month.every((day) => !day.isOutsideMonth)).toBe(true);
          expect(new Set(month.map((day) => day.fullDate)).size).toBe(days);
          // Dates sit in the column their weekday implies: Sunday=0 or Monday=0.
          month.forEach((day) => {
            const column = weeks.flat().indexOf(day) % 7;
            const weekday = new Date(day.fullDate + 'T00:00').getDay();
            expect(column).toBe(
              weekStart === 'sunday' ? weekday : (weekday + 6) % 7
            );
          });
        }
      }
    );

    it('keeps cell identities (date, today, selected) the same in either mode', () => {
      const byDate = (weekStart: 'sunday' | 'monday') =>
        Object.fromEntries(
          getMonth('2026-07-15', '2026-07-13', weekStart)
            .flat()
            .filter((day) => day.fullDate.startsWith('2026-07'))
            .map((day) => [
              day.fullDate,
              [day.date, day.isToday, day.isSelected],
            ])
        );
      expect(byDate('monday')).toEqual(byDate('sunday'));
    });

    function weeksFirstCell(visible: string, weekStart: 'sunday' | 'monday') {
      return firstColumn(getMonth(visible, undefined, weekStart))[0];
    }
  });
});
