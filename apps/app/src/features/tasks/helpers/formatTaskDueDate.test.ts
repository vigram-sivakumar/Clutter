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

  it('renders day + abbreviated month + year for other dates — via the shared formatDateDisplay "condensed" mode', () => {
    expect(formatTaskDueDate('2026-08-15')).toBe('15 Aug 2026');
    expect(formatTaskDueDate('2026-09-30')).toBe('30 Sep 2026');
  });

  it('renders day + abbreviated month + year for dates outside the current year', () => {
    expect(formatTaskDueDate('2027-11-19')).toBe('19 Nov 2027');
  });

  it('renders the bare weekday name for another day within the current week', () => {
    // System time is 2026-08-04 (Tuesday); 2026-08-07 (Friday) is later the same week.
    expect(formatTaskDueDate('2026-08-07')).toBe('Friday');
  });
});
