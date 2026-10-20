import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatTaskDueDate, formatTaskDueDateLong } from './formatTaskDueDate';

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

  it('renders day + abbreviated month, no weekday, no year, for other dates in the current year — via the shared formatDateDisplay "short" style', () => {
    // System time is faked to 2026-08-04 — 'short' style drops the
    // year when it matches the reference date's year (dateDisplay.ts),
    // with no "within the current week"
    // cutoff — every non-Today/Tomorrow/Yesterday date in the current
    // year renders identically, whether it's this week or months away.
    expect(formatTaskDueDate('2026-08-07')).toBe('7 Aug');
    expect(formatTaskDueDate('2026-08-15')).toBe('15 Aug');
    expect(formatTaskDueDate('2026-10-30')).toBe('30 Oct');
  });

  it('renders day + abbreviated month + two-digit year for dates outside the current year', () => {
    expect(formatTaskDueDate('2027-11-19')).toBe('19 Nov 27');
  });
});

describe('formatTaskDueDateLong', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 4)); // 2026-08-04
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('spells the month out and leaves the year off in the current year, unlike the sidebar label', () => {
    expect(formatTaskDueDate('2026-08-20')).toBe('20 Aug');
    expect(formatTaskDueDateLong('2026-08-20')).toBe('20 August');
  });

  it('shows the year in any other year', () => {
    expect(formatTaskDueDateLong('2027-09-02')).toBe('2 September 2027');
  });

  it('still reads Today / Tomorrow / Yesterday by name', () => {
    expect(formatTaskDueDateLong('2026-08-04')).toBe('Today');
    expect(formatTaskDueDateLong('2026-08-05')).toBe('Tomorrow');
    expect(formatTaskDueDateLong('2026-08-03')).toBe('Yesterday');
  });
});
