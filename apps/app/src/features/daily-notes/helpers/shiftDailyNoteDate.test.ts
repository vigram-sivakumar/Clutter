import { describe, expect, it } from 'vitest';
import { shiftDailyNoteDate, todayAsDailyNoteDate } from './shiftDailyNoteDate';

describe('shiftDailyNoteDate', () => {
  it('moves by whole days in either direction', () => {
    expect(shiftDailyNoteDate('2026-10-22', 1)).toBe('2026-10-23');
    expect(shiftDailyNoteDate('2026-10-22', -1)).toBe('2026-10-21');
  });

  it('crosses month, year and leap-day boundaries', () => {
    expect(shiftDailyNoteDate('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDailyNoteDate('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDailyNoteDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftDailyNoteDate('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('is not moved by a daylight-saving change', () => {
    expect(shiftDailyNoteDate('2026-03-28', 1)).toBe('2026-03-29');
    expect(shiftDailyNoteDate('2026-10-24', 1)).toBe('2026-10-25');
  });
});

describe('todayAsDailyNoteDate', () => {
  it('is the local calendar date, zero-padded', () => {
    expect(todayAsDailyNoteDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(todayAsDailyNoteDate(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });
});
