import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatTaskDueDate, formatTaskDueDateWithYear } from './formatTaskDueDate';

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

  it('renders day + abbreviated month, no weekday, no year, for other dates in the current year — via the shared formatDateDisplay "contextual" mode', () => {
    // System time is faked to 2026-08-04 — 'contextual' mode drops the
    // year when it matches the reference date's year (dateDisplay.ts),
    // same as 'condensed' mode, but with no "within the current week"
    // cutoff — every non-Today/Tomorrow/Yesterday date in the current
    // year renders identically, whether it's this week or months away.
    expect(formatTaskDueDate('2026-08-07')).toBe('7 Aug');
    expect(formatTaskDueDate('2026-08-15')).toBe('15 Aug');
    expect(formatTaskDueDate('2026-09-30')).toBe('30 Sep');
  });

  it('renders day + abbreviated month + two-digit year for dates outside the current year', () => {
    expect(formatTaskDueDate('2027-11-19')).toBe('19 Nov 27');
  });
});

describe('formatTaskDueDateWithYear', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 4)); // 2026-08-04
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('always shows the year for dates in the current year, unlike the sidebar label', () => {
    expect(formatTaskDueDate('2026-08-20')).toBe('20 Aug');
    expect(formatTaskDueDateWithYear('2026-08-20')).toBe('20 Aug 2026');
  });

  it('shows the year for other years too', () => {
    expect(formatTaskDueDateWithYear('2027-09-02')).toBe('2 Sep 2027');
  });

  it('still reads Today / Tomorrow / Yesterday by name', () => {
    expect(formatTaskDueDateWithYear('2026-08-04')).toBe('Today');
    expect(formatTaskDueDateWithYear('2026-08-05')).toBe('Tomorrow');
    expect(formatTaskDueDateWithYear('2026-08-03')).toBe('Yesterday');
  });
});
