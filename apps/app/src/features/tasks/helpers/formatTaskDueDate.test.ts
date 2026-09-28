import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatTaskDueDate } from './formatTaskDueDate';

describe('formatTaskDueDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 4)); // 2026-08-04
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders "Today" for today\'s date', () => {
    expect(formatTaskDueDate('2026-08-04')).toBe('Today');
  });

  it('renders "Tomorrow" for tomorrow\'s date', () => {
    expect(formatTaskDueDate('2026-08-05')).toBe('Tomorrow');
  });

  it('renders "Yesterday" for yesterday\'s date', () => {
    expect(formatTaskDueDate('2026-08-03')).toBe('Yesterday');
  });

  it('renders abbreviated weekday + day + abbreviated month, no year, for other dates in the current year — via the shared formatDateDisplay "contextual" mode', () => {
    // System time is faked to 2026-08-04 — 'contextual' mode drops the
    // year when it matches the reference date's year (dateDisplay.ts),
    // unlike 'compact'/'full' mode, since a sidebar row has less room and
    // reads its due date against "now" far more often than an inline
    // @date does. Unlike the weekday-name-only 'condensed'/'compact'
    // modes, there's no "within the current week" cutoff here — the
    // weekday is always shown alongside the day/month.
    expect(formatTaskDueDate('2026-08-15')).toBe('Sat 15 Aug');
    expect(formatTaskDueDate('2026-09-30')).toBe('Wed 30 Sep');
  });

  it('renders day + abbreviated month + two-digit year, no weekday, for dates outside the current year', () => {
    expect(formatTaskDueDate('2027-11-19')).toBe('19 Nov 27');
  });

  it('renders the abbreviated weekday alongside the date for another day within the current week', () => {
    // System time is 2026-08-04 (Tuesday); 2026-08-07 (Friday) is later the same week.
    expect(formatTaskDueDate('2026-08-07')).toBe('Fri 7 Aug');
  });
});
