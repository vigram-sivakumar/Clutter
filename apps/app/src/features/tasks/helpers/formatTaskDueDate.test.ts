import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DateFormatChoice } from '@shared/helpers/time/dateFormatPreference';
import { setSystemLocaleOverride } from '@shared/helpers/time/dateLocale';
import { formatTaskDueDate, formatTaskDueDateLong, formatTaskDueTime } from './formatTaskDueDate';

// Which Date format the formatter reads for the test in hand. The long label is about how a date is written in a
// specific format, so each test says which one; none leans on the global default.
const preference = vi.hoisted(() => ({ format: 'full' as DateFormatChoice }));
vi.mock('@shared/helpers/time/dateFormatPreference', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/helpers/time/dateFormatPreference')>()),
  readDateFormatChoice: () => preference.format,
}));

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
    preference.format = 'full';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('in the Full date format, spells the month out and leaves the year off in the current year, unlike the sidebar label', () => {
    expect(formatTaskDueDate('2026-08-20')).toBe('20 Aug');
    expect(formatTaskDueDateLong('2026-08-20')).toBe('20 August');
  });

  it('in the Full date format, shows the year in any other year', () => {
    expect(formatTaskDueDateLong('2027-09-02')).toBe('2 September 2027');
  });

  it('in the Full date format, writes today and its neighbours as dates: no relative words', () => {
    expect(formatTaskDueDateLong('2026-08-04')).toBe('4 August');
    expect(formatTaskDueDateLong('2026-08-05')).toBe('5 August');
    expect(formatTaskDueDateLong('2026-08-03')).toBe('3 August');
  });

  it('in the Relative format, still reads Today / Tomorrow / Yesterday by name', () => {
    preference.format = 'relative';

    expect(formatTaskDueDateLong('2026-08-04')).toBe('Today');
    expect(formatTaskDueDateLong('2026-08-05')).toBe('Tomorrow');
    expect(formatTaskDueDateLong('2026-08-03')).toBe('Yesterday');
  });

  it('in the Relative format, writes the other dates short', () => {
    preference.format = 'relative';

    expect(formatTaskDueDateLong('2026-08-20')).toBe('20 Aug');
    expect(formatTaskDueDateLong('2027-09-02')).toMatch(/^2 Sep(t)? 2027$/);
  });
});

describe('formatTaskDueTime', () => {
  afterEach(() => {
    setSystemLocaleOverride(null);
  });

  it("renders a time of day in the locale's own clock (24-hour, en-GB)", () => {
    setSystemLocaleOverride('en-GB');
    expect(formatTaskDueTime('07:00')).toBe('07:00');
    expect(formatTaskDueTime('21:05')).toBe('21:05');
  });

  it("renders a time of day in the locale's own clock (12-hour, en-US)", () => {
    setSystemLocaleOverride('en-US');
    expect(formatTaskDueTime('07:00')).toBe('7:00 AM');
    expect(formatTaskDueTime('21:05')).toBe('9:05 PM');
  });

  it('midnight renders correctly, not as an empty/falsy hour', () => {
    setSystemLocaleOverride('en-GB');
    expect(formatTaskDueTime('00:00')).toBe('00:00');
  });
});
