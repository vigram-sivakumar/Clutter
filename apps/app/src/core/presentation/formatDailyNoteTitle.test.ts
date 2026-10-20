import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatDailyNoteTitle } from './formatDailyNoteTitle';

afterEach(() => vi.useRealTimers());

describe('formatDailyNoteTitle (default system format, locale en-IN, today = Sunday 4 October 2026)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 12));
  });

  it.each([
    ['2026-10-04', 'Today, 4 October'],
    ['2026-10-03', 'Yesterday, 3 October'],
    ['2026-10-05', 'Tomorrow, 5 October'],
    ['2026-10-07', 'Wed, 7 October'],
    ['2026-10-02', 'Fri, 2 October'],
    ['2026-01-01', 'Thu, 1 January'],
    ['2025-12-31', 'Wed, 31 December 2025'],
    ['2027-01-02', 'Sat, 2 January 2027'],
  ])('%s reads %s', (name, expected) => {
    expect(formatDailyNoteTitle(name)).toBe(expected);
  });

  it.each(['not-a-date', '2026-02-30', '2026-13-01', ''])(
    'leaves a malformed name (%j) as it is',
    (name) => {
      expect(formatDailyNoteTitle(name)).toBe(name);
    }
  );
});

describe('formatDailyNoteTitle across a year change', () => {
  it("on New Year's Eve, 23:30 local time, the new year is the other year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 23, 30));

    expect(formatDailyNoteTitle('2026-12-31')).toBe('Today, 31 December');
    expect(formatDailyNoteTitle('2027-01-01')).toBe('Tomorrow, 1 January 2027');
  });

  it('ten minutes into the new year, last year is the other year', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 0, 1, 0, 10));

    expect(formatDailyNoteTitle('2027-01-01')).toBe('Today, 1 January');
    expect(formatDailyNoteTitle('2026-12-31')).toBe(
      'Yesterday, 31 December 2026'
    );
  });
});
