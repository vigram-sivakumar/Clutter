import { describe, expect, it } from 'vitest';

import type { WeekStart } from '@features/daily-notes/calendar/weekStart';
import { startOfWeek } from '@features/daily-notes/calendar/weekStart';
import { parseWeekday, resolveDateExpression, resolveDayOfMonth, type DateExpressionContext } from './dateExpressions';

// Thursday, 2026-08-20.
const THURSDAY = new Date(2026, 7, 20);

function context(referenceDate: Date, weekStart: WeekStart = 'monday'): DateExpressionContext {
  return { referenceDate, startOfWeek: (date) => startOfWeek(new Date(date), weekStart) };
}

const iso = (query: string, referenceDate: Date = THURSDAY, weekStart: WeekStart = 'monday') =>
  resolveDateExpression(query, context(referenceDate, weekStart))?.isoDate ?? null;

describe('days, weeks, months and years from today', () => {
  it('7d, 7days, in 7days and in 7 days all mean seven calendar days from today', () => {
    for (const query of ['7d', '7days', 'in 7days', 'in 7 days', '7D', 'In 7 Days']) {
      expect(iso(query), query).toBe('2026-08-27');
    }
  });

  it('counts calendar days, never milliseconds, across a daylight-saving change', () => {
    // Late October: Europe and the US change clocks around here; a day is a calendar day regardless.
    expect(iso('1d', new Date(2026, 9, 24))).toBe('2026-10-25');
    expect(iso('2d', new Date(2026, 9, 24))).toBe('2026-10-26');
    expect(iso('1d', new Date(2026, 10, 1))).toBe('2026-11-02');
    expect(iso('in 30 days', new Date(2026, 2, 1))).toBe('2026-03-31');
  });

  it('singular and plural units, and the short forms, are the same', () => {
    expect(iso('in 1 day')).toBe('2026-08-21');
    expect(iso('in 2 days')).toBe('2026-08-22');
    expect(iso('in 1 week')).toBe('2026-08-27');
    expect(iso('1w')).toBe('2026-08-27');
    expect(iso('in 3 weeks')).toBe('2026-09-10');
    expect(iso('in 2 months')).toBe('2026-10-20');
    expect(iso('2months')).toBe('2026-10-20');
    expect(iso('in 1 year')).toBe('2027-08-20');
    expect(iso('1y')).toBe('2027-08-20');
    expect(iso('in 0 days')).toBe('2026-08-20');
  });

  it('months and years clamp to the last day of a shorter month', () => {
    expect(iso('in 1 month', new Date(2026, 0, 31))).toBe('2026-02-28');
    expect(iso('in 1 month', new Date(2024, 0, 31))).toBe('2024-02-29');
    expect(iso('in 1 month', new Date(2026, 2, 31))).toBe('2026-04-30');
    expect(iso('in 12 months', new Date(2024, 1, 29))).toBe('2025-02-28');
    expect(iso('in 1 year', new Date(2024, 1, 29))).toBe('2025-02-28');
    expect(iso('in 4 years', new Date(2024, 1, 29))).toBe('2028-02-29');
    expect(iso('in 2 months', new Date(2026, 11, 15))).toBe('2027-02-15');
  });

  it('is not offered until the expression is complete', () => {
    for (const query of ['in', 'in ', 'in 3', 'in 3 ', 'in 3 w x', 'in 3 wee', 'in 3 mon', '7da', '7m', '7', 'in 7da', 'd', 'in d']) {
      expect(iso(query), query).toBeNull();
    }
  });

  it('typed one character at a time, "in 3 weeks" resolves only once the unit is a unit', () => {
    const typed = 'in 3 weeks';
    const resolved = [...typed].map((_, index) => iso(typed.slice(0, index + 1)) !== null);
    // i, in, "in ", "in 3", "in 3 " — nothing yet. "in 3 w": w is a unit. "in 3 we", "in 3 wee": not a unit.
    // "in 3 week", "in 3 weeks": complete.
    expect(resolved).toEqual([false, false, false, false, false, true, false, false, true, true]);
  });

  it('refuses amounts or results that would not be a sensible date', () => {
    expect(iso('in 99999 days')).toBeNull();
    expect(iso('in 9999 years')).toBeNull();
    expect(iso('in 9999 days')).toBe('2054-01-04');
  });
});

describe('next and last week, month and year', () => {
  it('next week and last week are the first day of that calendar week, by the week-start setting', () => {
    expect(iso('next week', THURSDAY, 'monday')).toBe('2026-08-24');
    expect(iso('last week', THURSDAY, 'monday')).toBe('2026-08-10');
    expect(iso('next week', THURSDAY, 'sunday')).toBe('2026-08-23');
    expect(iso('last week', THURSDAY, 'sunday')).toBe('2026-08-09');
  });

  it('on the first day of a week, next week is exactly seven days on', () => {
    expect(iso('next week', new Date(2026, 7, 17), 'monday')).toBe('2026-08-24');
    expect(iso('next week', new Date(2026, 7, 16), 'sunday')).toBe('2026-08-23');
    // A Sunday belongs to the week that started the Monday before.
    expect(iso('next week', new Date(2026, 7, 23), 'monday')).toBe('2026-08-24');
    expect(iso('next week', new Date(2026, 7, 23), 'sunday')).toBe('2026-08-30');
  });

  it('crosses month and year ends', () => {
    expect(iso('next week', new Date(2026, 11, 31), 'monday')).toBe('2027-01-04');
    expect(iso('last week', new Date(2027, 0, 1), 'monday')).toBe('2026-12-21');
  });

  it('next and last month are the first of that month', () => {
    expect(iso('next month')).toBe('2026-09-01');
    expect(iso('last month')).toBe('2026-07-01');
    expect(iso('next month', new Date(2026, 11, 31))).toBe('2027-01-01');
    expect(iso('last month', new Date(2026, 0, 15))).toBe('2025-12-01');
    expect(iso('next month', new Date(2026, 0, 31))).toBe('2026-02-01');
  });

  it('next and last year are January 1', () => {
    expect(iso('next year')).toBe('2027-01-01');
    expect(iso('last year')).toBe('2025-01-01');
  });

  it('this week, this month and this year are not expressions', () => {
    for (const query of ['this week', 'this month', 'this year', 'this friday']) {
      expect(iso(query), query).toBeNull();
    }
  });

  it('is not offered while the period word is unfinished', () => {
    for (const query of ['next', 'next ', 'last', 'next w', 'next we', 'next wee', 'next mont', 'next ye', 'last mo', 'next foo']) {
      expect(iso(query), query).toBeNull();
    }
  });
});

describe('weekdays', () => {
  it('a bare weekday is the next one strictly after today', () => {
    expect(iso('fri')).toBe('2026-08-21');
    expect(iso('friday')).toBe('2026-08-21');
    expect(iso('mon')).toBe('2026-08-24');
    expect(iso('sunday')).toBe('2026-08-23');
    // Today is Thursday: Thursday means next Thursday.
    expect(iso('thu')).toBe('2026-08-27');
    expect(iso('thursday')).toBe('2026-08-27');
  });

  it('on a Friday, friday is a week away; the day after is one day away', () => {
    expect(iso('fri', new Date(2026, 7, 21))).toBe('2026-08-28');
    expect(iso('sat', new Date(2026, 7, 21))).toBe('2026-08-22');
  });

  it('next <weekday> is that weekday of the next calendar week', () => {
    expect(iso('next monday', THURSDAY, 'monday')).toBe('2026-08-24');
    expect(iso('next friday', THURSDAY, 'monday')).toBe('2026-08-28');
    expect(iso('next sunday', THURSDAY, 'monday')).toBe('2026-08-30');
    expect(iso('next sunday', THURSDAY, 'sunday')).toBe('2026-08-23');
    expect(iso('next monday', THURSDAY, 'sunday')).toBe('2026-08-24');
    // From a Sunday the "next week" starts a week after the one the Sunday ends.
    expect(iso('next monday', new Date(2026, 7, 23), 'monday')).toBe('2026-08-24');
  });

  it('last <weekday> is the most recent one strictly before today', () => {
    expect(iso('last friday')).toBe('2026-08-14');
    expect(iso('last wednesday')).toBe('2026-08-19');
    expect(iso('last thursday')).toBe('2026-08-13');
    // On a Friday, last friday is the Friday a week ago, not today.
    expect(iso('last friday', new Date(2026, 7, 21))).toBe('2026-08-14');
    expect(iso('last monday', new Date(2026, 7, 21))).toBe('2026-08-17');
  });

  it('knows full names, the usual abbreviations and, for a bare word, a unique prefix', () => {
    expect(parseWeekday('Tuesday')).toBe(2);
    expect(parseWeekday('tue')).toBe(2);
    expect(parseWeekday('tues')).toBe(2);
    expect(parseWeekday('thurs')).toBe(4);
    expect(parseWeekday('sat')).toBe(6);
    expect(parseWeekday('fr', true)).toBe(5);
    expect(parseWeekday('wedn', true)).toBe(3);
  });

  it('is unambiguous: a letter or an ambiguous prefix names no weekday, and a month word is not one', () => {
    for (const word of ['t', 's', 'm', 'f', 'w', 'x', 'monthly']) {
      expect(parseWeekday(word, true), word).toBeNull();
    }
    expect(iso('mar')).toBeNull();
    expect(iso('sep')).toBeNull();
    expect(parseWeekday('mon')).toBe(1);
    // After next / last only whole names and abbreviations count: `next we` may be on its way to `next week`.
    expect(parseWeekday('fr')).toBeNull();
    expect(iso('next fr')).toBeNull();
    expect(iso('next mon')).toBe('2026-08-24');
  });
});

describe('the day of the month', () => {
  it('is that day of this month when it is still ahead', () => {
    expect(resolveDayOfMonth(24, THURSDAY)?.isoDate).toBe('2026-08-24');
    expect(resolveDayOfMonth(31, THURSDAY)?.isoDate).toBe('2026-08-31');
  });

  it('is today when today is that day', () => {
    expect(resolveDayOfMonth(20, THURSDAY)?.isoDate).toBe('2026-08-20');
  });

  it('is the next month once the day has passed, with the same day number', () => {
    expect(resolveDayOfMonth(19, THURSDAY)?.isoDate).toBe('2026-09-19');
    expect(resolveDayOfMonth(2, new Date(2026, 9, 23))?.isoDate).toBe('2026-11-02');
    expect(resolveDayOfMonth(2, new Date(2026, 11, 23))?.isoDate).toBe('2027-01-02');
  });

  it('never lands in the past', () => {
    for (let day = 1; day <= 31; day += 1) {
      const resolved = resolveDayOfMonth(day, new Date(2026, 8, 17));
      expect(resolved, String(day)).not.toBeNull();
      expect(resolved!.isoDate >= '2026-09-17', String(day)).toBe(true);
    }
  });

  it('skips a month too short for the day instead of clamping it', () => {
    // September has 30 days: the 31st is October 31st.
    expect(resolveDayOfMonth(31, new Date(2026, 8, 5))?.isoDate).toBe('2026-10-31');
    // January 31st has passed; February has no 30th, so March 30th.
    expect(resolveDayOfMonth(30, new Date(2026, 0, 31))?.isoDate).toBe('2026-03-30');
    // Today is the 31st.
    expect(resolveDayOfMonth(31, new Date(2026, 0, 31))?.isoDate).toBe('2026-01-31');
    expect(resolveDayOfMonth(31, new Date(2026, 1, 1))?.isoDate).toBe('2026-03-31');
    expect(resolveDayOfMonth(29, new Date(2026, 1, 1))?.isoDate).toBe('2026-03-29');
    expect(resolveDayOfMonth(29, new Date(2028, 1, 1))?.isoDate).toBe('2028-02-29');
  });

  it('is nothing for a number that is not a day', () => {
    expect(resolveDayOfMonth(0, THURSDAY)).toBeNull();
    expect(resolveDayOfMonth(32, THURSDAY)).toBeNull();
    expect(resolveDayOfMonth(-1, THURSDAY)).toBeNull();
    expect(resolveDayOfMonth(2.5, THURSDAY)).toBeNull();
  });

  it('an ordinal is the day of the month: 24th, 7th, 1st, 2nd, 3rd, 11th, 22nd', () => {
    expect(iso('24th')).toBe('2026-08-24');
    expect(iso('7th')).toBe('2026-09-07');
    expect(iso('1st')).toBe('2026-09-01');
    expect(iso('2nd')).toBe('2026-09-02');
    expect(iso('3rd')).toBe('2026-09-03');
    expect(iso('11th')).toBe('2026-09-11');
    expect(iso('22nd')).toBe('2026-08-22');
    expect(iso('31st')).toBe('2026-08-31');
  });

  it('an ordinal with the wrong suffix, or an unfinished one, is nothing', () => {
    for (const query of ['1th', '2st', '3nd', '4rd', '11st', '7t', '7s', '24tx', '0th', '32nd']) {
      expect(iso(query), query).toBeNull();
    }
  });
});

describe('everything else is left to the rest of the grammar', () => {
  it('bare numbers, time forms, months and ISO dates are not expressions', () => {
    for (const query of ['24', '7', '12', '1:30', '7p', '12a', 'mar', '12 mar', '2027 jan', '2026-08-22', '', ' ', 'hello', 'in  3 days']) {
      expect(iso(query), query).toBeNull();
    }
  });

  it('labels are the date in the user’s own format, never a layout of this module’s', () => {
    const result = resolveDateExpression('in 3 days', context(THURSDAY));
    expect(result?.isoDate).toBe('2026-08-23');
    expect(typeof result?.label).toBe('string');
    expect(result?.label.length).toBeGreaterThan(0);
  });
});
