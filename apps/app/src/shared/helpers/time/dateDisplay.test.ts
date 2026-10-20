import { afterEach, describe, expect, it } from 'vitest';

import {
  formatAbsoluteDate,
  formatDateDisplay,
  formatDateFormatExample,
  formatDateTimeDisplay,
  formatRelativeTimestamp,
  formatTimeDisplay,
} from './dateDisplay';
import type { DateFormatChoice } from './dateFormatPreference';
import { setSystemLocaleOverride } from './dateLocale';

// Tuesday, 2026-10-20, 11:30 local time. Every expectation names its locale and format, so none of them
// depends on the machine or on the Date format a developer has saved.
const REFERENCE = new Date(2026, 9, 20, 11, 30);
const LOCALES = ['en-IN', 'en-US', 'en-GB'] as const;
const FORMATS: DateFormatChoice[] = [
  'relative',
  'full',
  'short',
  'weekday',
  'mdy',
  'dmy',
  'ymd',
];

// The dates the tables below are written for, in order: today, +2 days, +7 days, earlier this year, a date in
// the previous year, the last day of the previous year, the first day of next year, and next year.
const DATES = [
  '2026-10-20',
  '2026-10-22',
  '2026-10-27',
  '2026-03-05',
  '2025-10-20',
  '2025-12-31',
  '2027-01-01',
  '2027-03-05',
];

const LONG: Record<
  (typeof LOCALES)[number],
  Record<DateFormatChoice, string[]>
> = {
  'en-IN': {
    full: [
      '20 October',
      '22 October',
      '27 October',
      '5 March',
      '20 October 2025',
      '31 December 2025',
      '1 January 2027',
      '5 March 2027',
    ],
    short: [
      '20 Oct',
      '22 Oct',
      '27 Oct',
      '5 Mar',
      '20 Oct 2025',
      '31 Dec 2025',
      '1 Jan 2027',
      '5 Mar 2027',
    ],
    weekday: [
      'Tue, 20 Oct',
      'Thu, 22 Oct',
      'Tue, 27 Oct',
      'Thu, 5 Mar',
      'Mon, 20 Oct 2025',
      'Wed, 31 Dec 2025',
      'Fri, 1 Jan 2027',
      'Fri, 5 Mar 2027',
    ],
    mdy: [
      '10/20/2026',
      '10/22/2026',
      '10/27/2026',
      '03/05/2026',
      '10/20/2025',
      '12/31/2025',
      '01/01/2027',
      '03/05/2027',
    ],
    dmy: [
      '20/10/2026',
      '22/10/2026',
      '27/10/2026',
      '05/03/2026',
      '20/10/2025',
      '31/12/2025',
      '01/01/2027',
      '05/03/2027',
    ],
    ymd: [
      '2026/10/20',
      '2026/10/22',
      '2026/10/27',
      '2026/03/05',
      '2025/10/20',
      '2025/12/31',
      '2027/01/01',
      '2027/03/05',
    ],
    relative: [
      'Today',
      'Thu, 22 Oct',
      '27 Oct',
      '5 Mar',
      '20 Oct 2025',
      '31 Dec 2025',
      '1 Jan 2027',
      '5 Mar 2027',
    ],
  },
  'en-US': {
    full: [
      'October 20',
      'October 22',
      'October 27',
      'March 5',
      'October 20, 2025',
      'December 31, 2025',
      'January 1, 2027',
      'March 5, 2027',
    ],
    short: [
      'Oct 20',
      'Oct 22',
      'Oct 27',
      'Mar 5',
      'Oct 20, 2025',
      'Dec 31, 2025',
      'Jan 1, 2027',
      'Mar 5, 2027',
    ],
    weekday: [
      'Tue, Oct 20',
      'Thu, Oct 22',
      'Tue, Oct 27',
      'Thu, Mar 5',
      'Mon, Oct 20, 2025',
      'Wed, Dec 31, 2025',
      'Fri, Jan 1, 2027',
      'Fri, Mar 5, 2027',
    ],
    mdy: [
      '10/20/2026',
      '10/22/2026',
      '10/27/2026',
      '03/05/2026',
      '10/20/2025',
      '12/31/2025',
      '01/01/2027',
      '03/05/2027',
    ],
    dmy: [
      '20/10/2026',
      '22/10/2026',
      '27/10/2026',
      '05/03/2026',
      '20/10/2025',
      '31/12/2025',
      '01/01/2027',
      '05/03/2027',
    ],
    ymd: [
      '2026/10/20',
      '2026/10/22',
      '2026/10/27',
      '2026/03/05',
      '2025/10/20',
      '2025/12/31',
      '2027/01/01',
      '2027/03/05',
    ],
    relative: [
      'Today',
      'Thu, Oct 22',
      'Oct 27',
      'Mar 5',
      'Oct 20, 2025',
      'Dec 31, 2025',
      'Jan 1, 2027',
      'Mar 5, 2027',
    ],
  },
  'en-GB': {
    full: [
      '20 October',
      '22 October',
      '27 October',
      '5 March',
      '20 October 2025',
      '31 December 2025',
      '1 January 2027',
      '5 March 2027',
    ],
    short: [
      '20 Oct',
      '22 Oct',
      '27 Oct',
      '5 Mar',
      '20 Oct 2025',
      '31 Dec 2025',
      '1 Jan 2027',
      '5 Mar 2027',
    ],
    weekday: [
      'Tue, 20 Oct',
      'Thu, 22 Oct',
      'Tue, 27 Oct',
      'Thu, 5 Mar',
      'Mon, 20 Oct 2025',
      'Wed, 31 Dec 2025',
      'Fri, 1 Jan 2027',
      'Fri, 5 Mar 2027',
    ],
    mdy: [
      '10/20/2026',
      '10/22/2026',
      '10/27/2026',
      '03/05/2026',
      '10/20/2025',
      '12/31/2025',
      '01/01/2027',
      '03/05/2027',
    ],
    dmy: [
      '20/10/2026',
      '22/10/2026',
      '27/10/2026',
      '05/03/2026',
      '20/10/2025',
      '31/12/2025',
      '01/01/2027',
      '05/03/2027',
    ],
    ymd: [
      '2026/10/20',
      '2026/10/22',
      '2026/10/27',
      '2026/03/05',
      '2025/10/20',
      '2025/12/31',
      '2027/01/01',
      '2027/03/05',
    ],
    relative: [
      'Today',
      'Thu, 22 Oct',
      '27 Oct',
      '5 Mar',
      '20 Oct 2025',
      '31 Dec 2025',
      '1 Jan 2027',
      '5 Mar 2027',
    ],
  },
};

const HEADING: Record<
  (typeof LOCALES)[number],
  Record<DateFormatChoice, string[]>
> = {
  'en-IN': {
    full: [
      '20 October',
      '22 October',
      '27 October',
      '5 March',
      '20 October 2025',
      '31 December 2025',
      '1 January 2027',
      '5 March 2027',
    ],
    short: [
      '20 Oct',
      '22 Oct',
      '27 Oct',
      '5 Mar',
      '20 Oct 2025',
      '31 Dec 2025',
      '1 Jan 2027',
      '5 Mar 2027',
    ],
    weekday: [
      'Tue, 20 Oct',
      'Thu, 22 Oct',
      'Tue, 27 Oct',
      'Thu, 5 Mar',
      'Mon, 20 Oct 2025',
      'Wed, 31 Dec 2025',
      'Fri, 1 Jan 2027',
      'Fri, 5 Mar 2027',
    ],
    mdy: [
      '10/20/2026',
      '10/22/2026',
      '10/27/2026',
      '03/05/2026',
      '10/20/2025',
      '12/31/2025',
      '01/01/2027',
      '03/05/2027',
    ],
    dmy: [
      '20/10/2026',
      '22/10/2026',
      '27/10/2026',
      '05/03/2026',
      '20/10/2025',
      '31/12/2025',
      '01/01/2027',
      '05/03/2027',
    ],
    ymd: [
      '2026/10/20',
      '2026/10/22',
      '2026/10/27',
      '2026/03/05',
      '2025/10/20',
      '2025/12/31',
      '2027/01/01',
      '2027/03/05',
    ],
    relative: [
      'Today, 20 October',
      'Thu, 22 October',
      'Tue, 27 October',
      'Thu, 5 March',
      'Mon, 20 October 2025',
      'Wed, 31 December 2025',
      'Fri, 1 January 2027',
      'Fri, 5 March 2027',
    ],
  },
  'en-US': {
    full: [
      'October 20',
      'October 22',
      'October 27',
      'March 5',
      'October 20, 2025',
      'December 31, 2025',
      'January 1, 2027',
      'March 5, 2027',
    ],
    short: [
      'Oct 20',
      'Oct 22',
      'Oct 27',
      'Mar 5',
      'Oct 20, 2025',
      'Dec 31, 2025',
      'Jan 1, 2027',
      'Mar 5, 2027',
    ],
    weekday: [
      'Tue, Oct 20',
      'Thu, Oct 22',
      'Tue, Oct 27',
      'Thu, Mar 5',
      'Mon, Oct 20, 2025',
      'Wed, Dec 31, 2025',
      'Fri, Jan 1, 2027',
      'Fri, Mar 5, 2027',
    ],
    mdy: [
      '10/20/2026',
      '10/22/2026',
      '10/27/2026',
      '03/05/2026',
      '10/20/2025',
      '12/31/2025',
      '01/01/2027',
      '03/05/2027',
    ],
    dmy: [
      '20/10/2026',
      '22/10/2026',
      '27/10/2026',
      '05/03/2026',
      '20/10/2025',
      '31/12/2025',
      '01/01/2027',
      '05/03/2027',
    ],
    ymd: [
      '2026/10/20',
      '2026/10/22',
      '2026/10/27',
      '2026/03/05',
      '2025/10/20',
      '2025/12/31',
      '2027/01/01',
      '2027/03/05',
    ],
    relative: [
      'Today, October 20',
      'Thu, October 22',
      'Tue, October 27',
      'Thu, March 5',
      'Mon, October 20, 2025',
      'Wed, December 31, 2025',
      'Fri, January 1, 2027',
      'Fri, March 5, 2027',
    ],
  },
  'en-GB': {
    full: [
      '20 October',
      '22 October',
      '27 October',
      '5 March',
      '20 October 2025',
      '31 December 2025',
      '1 January 2027',
      '5 March 2027',
    ],
    short: [
      '20 Oct',
      '22 Oct',
      '27 Oct',
      '5 Mar',
      '20 Oct 2025',
      '31 Dec 2025',
      '1 Jan 2027',
      '5 Mar 2027',
    ],
    weekday: [
      'Tue, 20 Oct',
      'Thu, 22 Oct',
      'Tue, 27 Oct',
      'Thu, 5 Mar',
      'Mon, 20 Oct 2025',
      'Wed, 31 Dec 2025',
      'Fri, 1 Jan 2027',
      'Fri, 5 Mar 2027',
    ],
    mdy: [
      '10/20/2026',
      '10/22/2026',
      '10/27/2026',
      '03/05/2026',
      '10/20/2025',
      '12/31/2025',
      '01/01/2027',
      '03/05/2027',
    ],
    dmy: [
      '20/10/2026',
      '22/10/2026',
      '27/10/2026',
      '05/03/2026',
      '20/10/2025',
      '31/12/2025',
      '01/01/2027',
      '05/03/2027',
    ],
    ymd: [
      '2026/10/20',
      '2026/10/22',
      '2026/10/27',
      '2026/03/05',
      '2025/10/20',
      '2025/12/31',
      '2027/01/01',
      '2027/03/05',
    ],
    relative: [
      'Today, 20 October',
      'Thu, 22 October',
      'Tue, 27 October',
      'Thu, 5 March',
      'Mon, 20 October 2025',
      'Wed, 31 December 2025',
      'Fri, 1 January 2027',
      'Fri, 5 March 2027',
    ],
  },
};

const SHORT: Record<(typeof LOCALES)[number], string[]> = {
  'en-IN': [
    'Today',
    '22 Oct',
    '27 Oct',
    '5 Mar',
    '20 Oct 25',
    '31 Dec 25',
    '1 Jan 27',
    '5 Mar 27',
  ],
  'en-US': [
    'Today',
    'Oct 22',
    'Oct 27',
    'Mar 5',
    'Oct 20, 25',
    'Dec 31, 25',
    'Jan 1, 27',
    'Mar 5, 27',
  ],
  'en-GB': [
    'Today',
    '22 Oct',
    '27 Oct',
    '5 Mar',
    '20 Oct 25',
    '31 Dec 25',
    '1 Jan 27',
    '5 Mar 27',
  ],
};

afterEach(() => setSystemLocaleOverride('en-IN'));

describe.each(LOCALES)('formatDateDisplay in %s', (locale) => {
  describe("'long' — every format, today / +2 / +7 / earlier this year / last year / next year", () => {
    it.each(FORMATS)('%s', (format) => {
      expect(
        DATES.map((date) =>
          formatDateDisplay(date, 'long', REFERENCE, { locale, format })
        )
      ).toEqual(LONG[locale][format]);
    });
  });

  describe("'heading' — a Daily Note's title", () => {
    it.each(FORMATS)('%s', (format) => {
      expect(
        DATES.map((date) =>
          formatDateDisplay(date, 'heading', REFERENCE, { locale, format })
        )
      ).toEqual(HEADING[locale][format]);
    });
  });

  it("'short' (the Tasks sidebar) is compact whatever the chosen format, and shortens a other year's year", () => {
    for (const format of FORMATS) {
      expect(
        DATES.map((date) =>
          formatDateDisplay(date, 'short', REFERENCE, { locale, format })
        )
      ).toEqual(SHORT[locale]);
    }
  });
});

describe('the year rule', () => {
  const ref = new Date(2026, 9, 20, 11, 30);
  const at = (iso: string, format: DateFormatChoice, locale = 'en-IN') =>
    formatDateDisplay(iso, 'long', ref, { locale, format });

  it.each([
    ['full', '20 October', '20 October 2025'],
    ['short', '20 Oct', '20 Oct 2025'],
    ['weekday', 'Tue, 20 Oct', 'Mon, 20 Oct 2025'],
  ] as const)(
    '%s leaves the year off in the current year and keeps it in any other',
    (format, current, other) => {
      expect(at('2026-10-20', format)).toBe(current);
      expect(at('2025-10-20', format)).toBe(other);
      expect(at('2027-10-20', format)).toContain('2027');
    }
  );

  it('the full format follows the locale and the same rule', () => {
    expect(at('2026-03-05', 'full', 'en-IN')).toBe('5 March');
    expect(at('2026-03-05', 'full', 'en-US')).toBe('March 5');
    expect(at('2025-03-05', 'full', 'en-US')).toBe('March 5, 2025');
    expect(at('2025-03-05', 'full', 'en-GB')).toBe('5 March 2025');
  });

  it.each([
    ['mdy', '10/20/2026', '10/20/2025'],
    ['dmy', '20/10/2026', '20/10/2025'],
    ['ymd', '2026/10/20', '2025/10/20'],
  ] as const)(
    '%s always shows the year, current or not',
    (format, current, other) => {
      expect(at('2026-10-20', format)).toBe(current);
      expect(at('2025-10-20', format)).toBe(other);
    }
  );

  it('the relative format keeps its labels, and applies the rule to the dates it falls back to', () => {
    expect(at('2026-10-20', 'relative')).toBe('Today');
    expect(at('2026-10-21', 'relative')).toBe('Tomorrow');
    expect(at('2026-10-19', 'relative')).toBe('Yesterday');
    expect(at('2026-03-05', 'relative')).toBe('5 Mar');
    expect(at('2025-03-05', 'relative')).toBe('5 Mar 2025');
  });

  it('applies to every style that shows a date: heading, absolute and timestamps too', () => {
    expect(
      formatDateDisplay('2026-03-05', 'heading', ref, {
        locale: 'en-IN',
        format: 'full',
      })
    ).toBe('5 March');
    expect(
      formatDateDisplay('2025-03-05', 'heading', ref, {
        locale: 'en-IN',
        format: 'full',
      })
    ).toBe('5 March 2025');
    expect(
      formatDateTimeDisplay(new Date(2026, 2, 5, 15, 45), ref, {
        locale: 'en-IN',
        format: 'full',
      })
    ).toBe('5 March, 3:45 pm');
    expect(
      formatDateTimeDisplay(new Date(2025, 2, 5, 15, 45), ref, {
        locale: 'en-IN',
        format: 'full',
      })
    ).toBe('5 March 2025, 3:45 pm');
  });

  it('crosses the year boundary in both directions', () => {
    const full = (iso: string, reference: Date) =>
      formatDateDisplay(iso, 'long', reference, {
        locale: 'en-IN',
        format: 'full',
      });
    const newYearsEve = new Date(2026, 11, 31, 23, 30);
    const newYearsDay = new Date(2027, 0, 1, 0, 10);

    expect(full('2026-12-31', newYearsEve)).toBe('31 December');
    expect(full('2027-01-01', newYearsEve)).toBe('1 January 2027');
    expect(full('2027-01-01', newYearsDay)).toBe('1 January');
    expect(full('2026-12-31', newYearsDay)).toBe('31 December 2026');
  });

  it("uses the reference date's local calendar year, not a UTC year", () => {
    // 23:30 on 31 December, local time: in a zone behind UTC the UTC year is already the next one.
    const lateNewYearsEve = new Date(2026, 11, 31, 23, 30);
    expect(
      formatDateDisplay('2026-12-31', 'long', lateNewYearsEve, {
        locale: 'en-IN',
        format: 'full',
      })
    ).toBe('31 December');
    expect(
      formatDateDisplay('2027-01-01', 'long', lateNewYearsEve, {
        locale: 'en-IN',
        format: 'full',
      })
    ).toBe('1 January 2027');
  });
});

describe("the 'relative' format's boundaries (reference: Tuesday 20 October 2026)", () => {
  const relative = (offset: number, locale = 'en-IN') => {
    const date = new Date(2026, 9, 20 + offset);
    const iso = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
    return formatDateDisplay(iso, 'long', REFERENCE, {
      locale,
      format: 'relative',
    });
  };

  it('reads Yesterday, Today and Tomorrow, then a weekday and date for the next five days, then a short date', () => {
    expect(
      [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((offset) => relative(offset))
    ).toEqual([
      '17 Oct',
      '18 Oct',
      'Yesterday',
      'Today',
      'Tomorrow',
      'Thu, 22 Oct',
      'Fri, 23 Oct',
      'Sat, 24 Oct',
      'Sun, 25 Oct',
      'Mon, 26 Oct',
      '27 Oct',
      '28 Oct',
    ]);
  });

  it("never repeats a weekday name inside the window, nor uses today's (Tue) for another day", () => {
    const names = [2, 3, 4, 5, 6].map((offset) => relative(offset));
    expect(new Set(names).size).toBe(5);
    expect(names).not.toContain('Tue');
  });

  it('puts a past date beyond yesterday back on the short date, so a weekday never means "last Friday"', () => {
    expect(relative(-2)).toBe('18 Oct');
    expect(relative(-6)).toBe('14 Oct');
  });

  it.each(['en-US', 'en-GB'])(
    'writes the fallback in the locale (%s)',
    (locale) => {
      expect(relative(7, locale)).toBe(
        locale === 'en-US' ? 'Oct 27' : '27 Oct'
      );
    }
  );
});

describe('Date with day', () => {
  it.each([
    ['en-IN', 'Mon, 20 Oct 2025'],
    ['en-GB', 'Mon, 20 Oct 2025'],
    ['en-US', 'Mon, Oct 20, 2025'],
  ])(
    "puts the three-letter weekday first and the date in the locale's order (%s)",
    (locale, expected) => {
      expect(
        formatDateDisplay('2025-10-20', 'long', REFERENCE, {
          locale,
          format: 'weekday',
        })
      ).toBe(expected);
    }
  );

  it('abbreviates every weekday to three letters and never double-commas (en-IN)', () => {
    for (let day = 18; day <= 24; day += 1) {
      const text = formatDateDisplay(`2025-10-${day}`, 'long', REFERENCE, {
        locale: 'en-IN',
        format: 'weekday',
      });
      expect(text).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{1,2} Oct 2025$/);
    }
  });
});

describe('formatAbsoluteDate', () => {
  const absolute = (iso: string, locale: string, format: DateFormatChoice) =>
    formatAbsoluteDate(iso, REFERENCE, { locale, format });

  it('names the day in the chosen format and under the year rule (reference: 20 October 2026)', () => {
    expect(absolute('2026-03-05', 'en-IN', 'full')).toBe('5 March');
    expect(absolute('2020-03-05', 'en-IN', 'full')).toBe('5 March 2020');
    expect(absolute('2020-03-05', 'en-US', 'full')).toBe('March 5, 2020');
    expect(absolute('2020-03-05', 'en-GB', 'full')).toBe('5 March 2020');
    expect(absolute('2020-03-05', 'en-IN', 'mdy')).toBe('03/05/2020');
    expect(absolute('2026-03-05', 'en-IN', 'mdy')).toBe('03/05/2026');
    expect(absolute('2020-03-05', 'en-IN', 'weekday')).toBe('Thu, 5 Mar 2020');
    expect(absolute('2026-03-05', 'en-IN', 'short')).toBe('5 Mar');
  });

  it('is never a relative word, not even for the reference day itself', () => {
    expect(absolute('2026-10-20', 'en-IN', 'relative')).toBe('20 Oct');
    expect(absolute('2026-10-20', 'en-IN', 'full')).toBe('20 October');
    expect(absolute('2026-10-21', 'en-US', 'full')).toBe('October 21');
  });
});

describe('calendar boundaries and daylight saving', () => {
  it("classifies by the reference date's local calendar day, at any time of day", () => {
    for (const hour of [0, 6, 12, 23]) {
      const ref = new Date(2026, 7, 20, hour, 59);
      const long = (iso: string) =>
        formatDateDisplay(iso, 'long', ref, {
          locale: 'en-IN',
          format: 'relative',
        });
      expect(long('2026-08-20')).toBe('Today');
      expect(long('2026-08-21')).toBe('Tomorrow');
      expect(long('2026-08-19')).toBe('Yesterday');
    }
  });

  it('crosses month and year boundaries and a leap day', () => {
    const long = (iso: string, ref: Date) =>
      formatDateDisplay(iso, 'long', ref, {
        locale: 'en-IN',
        format: 'relative',
      });
    expect(long('2026-09-01', new Date(2026, 7, 31))).toBe('Tomorrow');
    expect(long('2027-01-01', new Date(2026, 11, 31))).toBe('Tomorrow');
    expect(long('2026-12-31', new Date(2027, 0, 1))).toBe('Yesterday');
    expect(long('2028-02-29', new Date(2028, 1, 28))).toBe('Tomorrow');
    expect(
      formatDateDisplay('2028-02-29', 'long', new Date(2028, 5, 1), {
        locale: 'en-IN',
        format: 'relative',
      })
    ).toBe('29 Feb');
  });

  it('is not thrown by a 23- or 25-hour daylight-saving day (US: 8 Mar and 1 Nov 2026)', () => {
    const long = (iso: string, ref: Date) =>
      formatDateDisplay(iso, 'long', ref, {
        locale: 'en-IN',
        format: 'relative',
      });
    expect(long('2026-03-09', new Date(2026, 2, 8, 23, 30))).toBe('Tomorrow');
    expect(long('2026-03-08', new Date(2026, 2, 9, 0, 30))).toBe('Yesterday');
    expect(long('2026-11-02', new Date(2026, 10, 1, 23, 30))).toBe('Tomorrow');
    expect(long('2026-11-01', new Date(2026, 10, 2, 0, 30))).toBe('Yesterday');
  });
});

describe('time and timestamps, in the locale', () => {
  it.each([
    ['en-IN', ['9:05 am', '12:05 am', '12:00 pm', '11:59 pm']],
    ['en-US', ['9:05 AM', '12:05 AM', '12:00 PM', '11:59 PM']],
    ['en-GB', ['09:05', '00:05', '12:00', '23:59']],
  ])(
    "formatTimeDisplay (%s) uses the locale's own clock",
    (locale, expected) => {
      const times = [
        new Date(2026, 9, 20, 9, 5),
        new Date(2026, 9, 20, 0, 5),
        new Date(2026, 9, 20, 12, 0),
        new Date(2026, 9, 20, 23, 59),
      ];
      expect(times.map((time) => formatTimeDisplay(time, { locale }))).toEqual(
        expected
      );
    }
  );

  it.each([
    [
      'en-IN',
      [
        'Today, 9:05 am',
        'Yesterday, 8:20 pm',
        '5 Mar, 3:45 pm',
        '11 Nov 2025, 12:05 am',
      ],
    ],
    [
      'en-US',
      [
        'Today, 9:05 AM',
        'Yesterday, 8:20 PM',
        'Mar 5, 3:45 PM',
        'Nov 11, 2025, 12:05 AM',
      ],
    ],
    [
      'en-GB',
      [
        'Today, 09:05',
        'Yesterday, 20:20',
        '5 Mar, 15:45',
        '11 Nov 2025, 00:05',
      ],
    ],
  ])(
    'formatDateTimeDisplay (%s) in the relative format',
    (locale, expected) => {
      const instants = [
        new Date(2026, 9, 20, 9, 5),
        new Date(2026, 9, 19, 20, 20),
        new Date(2026, 2, 5, 15, 45),
        new Date(2025, 10, 11, 0, 5),
      ];
      expect(
        instants.map((instant) =>
          formatDateTimeDisplay(instant, REFERENCE, {
            locale,
            format: 'relative',
          })
        )
      ).toEqual(expected);
    }
  );

  it('follows the chosen format in the date half, and has no relative words in an explicit one', () => {
    const options = { locale: 'en-IN', format: 'dmy' as const };
    expect(
      formatDateTimeDisplay(new Date(2026, 9, 20, 9, 5), REFERENCE, options)
    ).toBe('20/10/2026, 9:05 am');
    expect(
      formatDateTimeDisplay(new Date(2026, 9, 20, 9, 5), REFERENCE, {
        locale: 'en-IN',
        format: 'short',
      })
    ).toBe('20 Oct, 9:05 am');
  });

  it("a recent instant reads as a relative age in the locale's words", () => {
    const now = new Date(2026, 9, 3, 14, 45, 30);
    const at = (minutesAgo: number) =>
      new Date(now.getTime() - minutesAgo * 60_000);
    expect(
      formatRelativeTimestamp(new Date(now.getTime() - 20_000), now, {
        locale: 'en-IN',
      })
    ).toBe('Just now');
    expect(formatRelativeTimestamp(at(1), now, { locale: 'en-IN' })).toBe(
      '1 minute ago'
    );
    expect(formatRelativeTimestamp(at(35), now, { locale: 'en-US' })).toBe(
      '35 minutes ago'
    );
    expect(formatRelativeTimestamp(at(65), now, { locale: 'en-GB' })).toBe(
      '1 hour ago'
    );
    expect(formatRelativeTimestamp(at(119), now, { locale: 'en-GB' })).toBe(
      '1 hour ago'
    );
    expect(formatRelativeTimestamp(at(120), now, { locale: 'en-GB' })).toBe(
      'Today, 12:45'
    );
    expect(
      formatRelativeTimestamp(new Date(now.getTime() + 3_600_000), now, {
        locale: 'en-GB',
      })
    ).toBe('Today, 15:45');
  });
});

describe('the system locale', () => {
  it('changing it changes the formatting, with no stored override', () => {
    setSystemLocaleOverride('en-IN');
    expect(
      formatDateDisplay('2025-03-05', 'long', REFERENCE, { format: 'full' })
    ).toBe('5 March 2025');
    setSystemLocaleOverride('en-US');
    expect(
      formatDateDisplay('2025-03-05', 'long', REFERENCE, { format: 'full' })
    ).toBe('March 5, 2025');
    expect(
      formatDateDisplay('2025-03-05', 'heading', REFERENCE, {
        format: 'relative',
      })
    ).toBe('Wed, March 5, 2025');
    setSystemLocaleOverride('en-GB');
    expect(formatTimeDisplay(new Date(2026, 9, 20, 21, 5))).toBe('21:05');
  });

  it('is read when the date is formatted, not when the module loads', () => {
    setSystemLocaleOverride('en-US');
    const first = formatDateDisplay('2025-03-05', 'long', REFERENCE, {
      format: 'full',
    });
    setSystemLocaleOverride('en-GB');
    const second = formatDateDisplay('2025-03-05', 'long', REFERENCE, {
      format: 'full',
    });
    expect([first, second]).toEqual(['March 5, 2025', '5 March 2025']);
  });
});

describe('formatDateFormatExample — the Settings menu, from the same formatter', () => {
  const examples = (locale: string) =>
    FORMATS.map((format) => formatDateFormatExample(format, { locale }));

  it.each([
    [
      'en-IN',
      [
        'Today',
        '20 October 2026',
        '20 Oct',
        'Tue, 20 Oct 2026',
        '10/20/2026',
        '20/10/2026',
        '2026/10/20',
      ],
    ],
    [
      'en-GB',
      [
        'Today',
        '20 October 2026',
        '20 Oct',
        'Tue, 20 Oct 2026',
        '10/20/2026',
        '20/10/2026',
        '2026/10/20',
      ],
    ],
    [
      'en-US',
      [
        'Today',
        'October 20, 2026',
        'Oct 20',
        'Tue, Oct 20, 2026',
        '10/20/2026',
        '20/10/2026',
        '2026/10/20',
      ],
    ],
  ])('%s', (locale, expected) => {
    expect(examples(locale)).toEqual(expected);
  });

  it('follows the system locale when none is given', () => {
    setSystemLocaleOverride('en-US');
    expect(formatDateFormatExample('weekday')).toBe('Tue, Oct 20, 2026');
    setSystemLocaleOverride('en-IN');
    expect(formatDateFormatExample('weekday')).toBe('Tue, 20 Oct 2026');
  });
});
