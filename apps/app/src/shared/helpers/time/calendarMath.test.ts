import { describe, expect, it } from 'vitest';
import { addMonthsClamped, addYearsClamped, daysInMonth, startOfMonthShifted, startOfYearShifted } from './calendarMath';
import { addMonths } from './math';

describe('daysInMonth', () => {
  it('knows the month lengths, leap years included', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });
});

describe('addMonthsClamped', () => {
  it('keeps the day when the target month has it', () => {
    expect(addMonthsClamped('2026-08-20', 1)).toBe('2026-09-20');
    expect(addMonthsClamped('2026-08-20', 2)).toBe('2026-10-20');
  });

  it('clamps to the last day of a shorter month instead of rolling into the next', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonthsClamped('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonthsClamped('2026-05-31', 1)).toBe('2026-06-30');
  });

  it('the helper it replaces rolls over, which is why this exists', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-03-03');
  });

  it('crosses year boundaries in both directions', () => {
    expect(addMonthsClamped('2026-12-15', 2)).toBe('2027-02-15');
    expect(addMonthsClamped('2026-01-15', -2)).toBe('2025-11-15');
    expect(addMonthsClamped('2026-01-31', 13)).toBe('2027-02-28');
    expect(addMonthsClamped('2026-08-20', 0)).toBe('2026-08-20');
    expect(addMonthsClamped('2026-08-20', -8)).toBe('2025-12-20');
  });

  it('moves a long way without drifting', () => {
    expect(addMonthsClamped('2026-08-20', 120)).toBe('2036-08-20');
    expect(addMonthsClamped('2026-08-20', -240)).toBe('2006-08-20');
  });
});

describe('addYearsClamped', () => {
  it('moves the year and keeps month and day', () => {
    expect(addYearsClamped('2026-08-20', 1)).toBe('2027-08-20');
    expect(addYearsClamped('2026-08-20', -3)).toBe('2023-08-20');
  });

  it('clamps a leap day to the last day of February', () => {
    expect(addYearsClamped('2024-02-29', 1)).toBe('2025-02-28');
    expect(addYearsClamped('2024-02-29', -1)).toBe('2023-02-28');
    expect(addYearsClamped('2024-02-29', 4)).toBe('2028-02-29');
  });
});

describe('startOfMonthShifted and startOfYearShifted', () => {
  it('give the first day of the month or year, shifted', () => {
    expect(startOfMonthShifted('2026-08-20', 1)).toBe('2026-09-01');
    expect(startOfMonthShifted('2026-08-20', -1)).toBe('2026-07-01');
    expect(startOfMonthShifted('2026-12-31', 1)).toBe('2027-01-01');
    expect(startOfMonthShifted('2026-01-15', -1)).toBe('2025-12-01');
    expect(startOfYearShifted('2026-08-20', 1)).toBe('2027-01-01');
    expect(startOfYearShifted('2026-08-20', -1)).toBe('2025-01-01');
  });
});
