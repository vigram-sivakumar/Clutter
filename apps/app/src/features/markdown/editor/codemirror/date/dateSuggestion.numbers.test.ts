// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeWeekStart } from '@features/daily-notes/calendar/weekStart';
import { setSystemLocaleOverride } from '@shared/helpers/time/dateLocale';
import { writeDateFormatChoice } from '@shared/helpers/time/dateFormatPreference';
import { getDateSuggestions } from './dateSuggestion';

// Friday, 2026-10-23.
const FRIDAY = new Date(2026, 9, 23);

beforeEach(() => {
  setSystemLocaleOverride('en-US');
  writeDateFormatChoice('relative');
  writeWeekStart('monday');
});
afterEach(() => {
  setSystemLocaleOverride(null);
  localStorage.clear();
});

const suggest = (query: string, reference: Date = FRIDAY) => getDateSuggestions(query, reference);
const kinds = (query: string, reference: Date = FRIDAY) =>
  suggest(query, reference).map((s) => (s.time ? `time ${s.time.hour24}:${String(s.time.minute).padStart(2, '0')} ${s.isoDate}` : `date ${s.isoDate}`));

describe('a bare number that is an hour and a day of the month', () => {
  it('@2 offers the time, then the day of the month — the next month, since the 2nd has passed', () => {
    expect(kinds('2')).toEqual(['time 2:00 2026-10-23', 'date 2026-11-02']);
  });

  it('@7 and @12 do the same, and a bare 12 is noon', () => {
    expect(kinds('7')).toEqual(['time 7:00 2026-10-23', 'date 2026-11-07']);
    expect(kinds('12')).toEqual(['time 12:00 2026-10-23', 'date 2026-11-12']);
  });

  it('a bare 1–11 is that hour in the morning, never the next upcoming one', () => {
    for (const hour of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      expect(suggest(String(hour))[0]!.time).toEqual({ hour24: hour, minute: 0 });
    }
    // Even late in the day: the existing meaning does not depend on the time of day.
    expect(suggest('2', new Date(2026, 9, 23, 22, 30))[0]!.time).toEqual({ hour24: 2, minute: 0 });
  });

  it('the time is first and the date second, always', () => {
    for (const hour of [1, 5, 9, 12]) {
      const [first, second] = suggest(String(hour));
      expect(first!.time).toBeDefined();
      expect(second!.time).toBeUndefined();
    }
  });

  it('the day of the month is today or ahead in this month, otherwise the next month, keeping its number', () => {
    // Today is the 23rd: the 2nd, 7th and 12th have passed; the 1st too.
    expect(kinds('1')[1]).toBe('date 2026-11-01');
    // From the 1st of a month, the 2nd, 7th and 12th are all still ahead.
    expect(kinds('2', new Date(2026, 9, 1))[1]).toBe('date 2026-10-02');
    expect(kinds('12', new Date(2026, 9, 1))[1]).toBe('date 2026-10-12');
    expect(kinds('2', new Date(2026, 11, 23))[1]).toBe('date 2027-01-02');
  });

  it('when both readings are the same date, one suggestion is offered — the date, which says what is inserted', () => {
    expect(kinds('2', new Date(2026, 9, 2))).toEqual(['date 2026-10-02']);
    expect(kinds('7', new Date(2026, 9, 7))).toEqual(['date 2026-10-07']);
    expect(kinds('12', new Date(2026, 9, 12))).toEqual(['date 2026-10-12']);
    expect(suggest('2', new Date(2026, 9, 2))[0]!.time).toBeUndefined();
  });

  it('is not offered twice and never holds two suggestions with the same inserted date and kind', () => {
    for (let n = 1; n <= 31; n += 1) {
      const all = suggest(String(n));
      expect(new Set(all.map((s) => `${Boolean(s.time)}${s.isoDate}`)).size).toBe(all.length);
      expect(all.length).toBeLessThanOrEqual(2);
    }
  });
});

describe('a number that can only be a day of the month', () => {
  it('@13–@31 offer the date alone', () => {
    expect(kinds('24')).toEqual(['date 2026-10-24']);
    expect(kinds('31')).toEqual(['date 2026-10-31']);
    expect(kinds('13')).toEqual(['date 2026-11-13']);
    expect(kinds('23')).toEqual(['date 2026-10-23']);
    expect(kinds('22')).toEqual(['date 2026-11-22']);
  });

  it('skips a month too short for the day, keeping the day number', () => {
    expect(kinds('31', new Date(2026, 8, 5))).toEqual(['date 2026-10-31']);
    expect(kinds('30', new Date(2026, 0, 31))).toEqual(['date 2026-03-30']);
  });

  it('is nothing for 0, 32 and up, or a number with a leading zero', () => {
    for (const query of ['0', '32', '45', '99', '00', '07', '05', '012']) {
      expect(suggest(query), query).toEqual([]);
    }
  });
});

describe('times that are not a bare hour stay times', () => {
  it('@1:30, @7p, @12a and @1:30p are one time suggestion, never a date', () => {
    expect(kinds('1:30')).toEqual(['time 1:30 2026-10-23']);
    expect(kinds('7p')).toEqual(['time 19:00 2026-10-23']);
    expect(kinds('12a')).toEqual(['time 0:00 2026-10-23']);
    expect(kinds('1:30p')).toEqual(['time 13:30 2026-10-23']);
    expect(kinds('12p')).toEqual(['time 12:00 2026-10-23']);
  });

  it('a time carries no date of its own: it is today, whatever hour is typed', () => {
    expect(suggest('9p')[0]!.isoDate).toBe('2026-10-23');
    expect(suggest('9p', new Date(2026, 9, 23, 23, 59))[0]!.isoDate).toBe('2026-10-23');
  });
});

describe('durations and ordinals are one date', () => {
  it('@7d, @7days, @in 7days, @in 7 days', () => {
    for (const query of ['7d', '7days', 'in 7days', 'in 7 days']) {
      expect(kinds(query), query).toEqual(['date 2026-10-30']);
    }
  });

  it('@7th and @24th are the day of the month, and leave the bare hours alone', () => {
    expect(kinds('7th')).toEqual(['date 2026-11-07']);
    expect(kinds('24th')).toEqual(['date 2026-10-24']);
    expect(kinds('7')).toHaveLength(2);
  });

  it('@in 3 waits for a unit', () => {
    expect(suggest('in 3')).toEqual([]);
    expect(suggest('in 3 ')).toEqual([]);
    expect(kinds('in 3 weeks')).toEqual(['date 2026-11-13']);
  });

  it('incomplete input offers nothing rather than a guess', () => {
    for (const query of ['in', 'in 3', 'in 3 wee', '7da', '7m', 'this week', 'next 3', 'next week x', 'nextt']) {
      expect(suggest(query), query).toEqual([]);
    }
  });
});

describe('words keep working, and weekdays join them', () => {
  it('@t, @tomorrow and @yesterday are as they were', () => {
    expect(suggest('t').map((s) => [s.label, s.isoDate])).toEqual([['Today', '2026-10-23']]);
    expect(suggest('tomorrow').map((s) => s.isoDate)).toEqual(['2026-10-24']);
    expect(suggest('yesterday').map((s) => s.isoDate)).toEqual(['2026-10-22']);
    expect(suggest('').map((s) => s.label)).toEqual(['Today']);
  });

  it('a weekday word is the next such day after today', () => {
    expect(kinds('mon')).toEqual(['date 2026-10-26']);
    expect(kinds('tu')).toEqual(['date 2026-10-27']);
    expect(kinds('friday')).toEqual(['date 2026-10-30']);
    expect(kinds('next monday')).toEqual(['date 2026-10-26']);
    expect(kinds('last friday')).toEqual(['date 2026-10-16']);
  });

  it('an ambiguous letter is not a weekday, and a month word is still a month', () => {
    expect(suggest('s')).toEqual([]);
    expect(suggest('m')).toEqual([]);
    expect(kinds('mar')).toEqual(['date 2027-03-23']);
    expect(kinds('12 mar')).toEqual(['date 2027-03-12']);
    expect(kinds('2027 jan 12')).toEqual(['date 2027-01-12']);
    expect(kinds('2026-08-22')).toEqual(['date 2026-08-22']);
  });
});

describe('the week-start setting', () => {
  it('is read from Settings when none is passed', () => {
    writeWeekStart('monday');
    expect(getDateSuggestions('next week', FRIDAY)[0]!.isoDate).toBe('2026-10-26');
    writeWeekStart('sunday');
    expect(getDateSuggestions('next week', FRIDAY)[0]!.isoDate).toBe('2026-10-25');
    expect(getDateSuggestions('last week', FRIDAY)[0]!.isoDate).toBe('2026-10-11');
  });

  it('can be passed, which wins over the stored choice', () => {
    writeWeekStart('sunday');
    expect(getDateSuggestions('next week', FRIDAY, 'monday')[0]!.isoDate).toBe('2026-10-26');
    expect(getDateSuggestions('next sunday', FRIDAY, 'monday')[0]!.isoDate).toBe('2026-11-01');
    expect(getDateSuggestions('next sunday', FRIDAY, 'sunday')[0]!.isoDate).toBe('2026-10-25');
  });
});

describe('what is inserted is always the canonical date', () => {
  it('every suggestion’s isoDate is YYYY-MM-DD, time suggestions included', () => {
    for (const query of ['2', '12', '24', '7d', 'in 2 months', 'next week', 'fri', '1:30p', 'today', '7th']) {
      for (const suggestion of suggest(query)) {
        expect(suggestion.isoDate, query).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});
