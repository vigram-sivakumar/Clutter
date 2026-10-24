// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeWeekStart } from '@features/daily-notes/calendar/weekStart';
import { setSystemLocaleOverride } from '@shared/helpers/time/dateLocale';
import { writeDateFormatChoice } from '@shared/helpers/time/dateFormatPreference';
import { serializeDateReference } from '@shared/helpers/time/dateReference';
import { dateRow } from './dateCompletionRow';
import { getDateSuggestions, suggestionReference } from './dateSuggestion';

// Friday, 2026-10-23. Week starts Monday.
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

/** What accepting the first suggestion would store, or null when nothing is offered. */
const stored = (query: string, reference: Date = FRIDAY): string | null => {
  const [first] = getDateSuggestions(query, reference);
  return first ? serializeDateReference(suggestionReference(first)) : null;
};

describe('both word orders mean the same date and time', () => {
  it.each<[string, string, string]>([
    ['4pm tomorrow', 'tomorrow 4pm', '2026-10-24T16:00'],
    ['9am next friday', 'next friday 9am', '2026-10-30T09:00'],
    ['2pm next month', 'next month 2pm', '2026-11-23T14:00'],
    ['10am next week', 'next week 10am', '2026-10-26T10:00'],
    ['3pm last month', 'last month 3pm', '2026-09-23T15:00'],
    ['2pm next year', 'next year 2pm', '2027-10-23T14:00'],
    ['14:30 tomorrow', 'tomorrow 14:30', '2026-10-24T14:30'],
    ['4pm in 3 weeks', 'in 3 weeks 4pm', '2026-11-13T16:00'],
    ['9am friday', 'friday 9am', '2026-10-30T09:00'],
    ['4:30pm today', 'today 4:30pm', '2026-10-23T16:30'],
  ])('%s and %s are %s', (before, after, expected) => {
    expect(stored(before)).toBe(expected);
    expect(stored(after)).toBe(expected);
  });

  it('offers exactly one suggestion, with the time on it', () => {
    const result = getDateSuggestions('next month 2pm', FRIDAY);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ isoDate: '2026-11-23', time: { hour24: 14, minute: 0 } });
  });
});

describe('the date is resolved first, with the agreed semantics', () => {
  it('next week follows the week-start setting, with the time on it', () => {
    expect(stored('next week 10am')).toBe('2026-10-26T10:00');
    writeWeekStart('sunday');
    expect(stored('next week 10am')).toBe('2026-10-25T10:00');
  });

  it('a bare weekday is the next one strictly after today; last friday is the most recent before today', () => {
    expect(stored('friday 4pm')).toBe('2026-10-30T16:00');
    expect(stored('last friday 4pm')).toBe('2026-10-16T16:00');
  });

  it('month and year arithmetic clamps at the month end, and crosses the boundary into the next year', () => {
    expect(stored('next month 9am', new Date(2026, 0, 31))).toBe('2026-02-28T09:00');
    expect(stored('next month 9am', new Date(2028, 0, 31))).toBe('2028-02-29T09:00');
    expect(stored('next month 9am', new Date(2026, 11, 31))).toBe('2027-01-31T09:00');
    expect(stored('next year 9am', new Date(2028, 1, 29))).toBe('2029-02-28T09:00');
  });
});

describe('a relative word of two letters offers everything it starts', () => {
  const dates = (query: string) => getDateSuggestions(query, FRIDAY).map((s) => `${s.isoDate}T${s.time?.hour24}`);

  it('to is Today and Tomorrow, in either order', () => {
    expect(dates('to 2pm')).toEqual(['2026-10-23T14', '2026-10-24T14']);
    expect(dates('2pm to')).toEqual(dates('to 2pm'));
  });

  it('ye is Yesterday, tom Tomorrow, and a letter on its own is not enough', () => {
    expect(dates('ye 9am')).toEqual(['2026-10-22T9']);
    expect(dates('tom 9am')).toEqual(['2026-10-24T9']);
    expect(dates('t 9am')).toEqual([]);
  });

  it('a weekday prefix still gives that weekday, and a two-letter word that is no date gives nothing', () => {
    expect(dates('tu 9am')).toEqual(['2026-10-27T9']);
    expect(dates('xy 9am')).toEqual([]);
  });

  it('works with the 24-hour hour too', () => {
    expect(dates('to 14')).toEqual(['2026-10-23T14', '2026-10-24T14']);
  });
});

describe('no date expression means today', () => {
  it.each<[string, string]>([
    ['4pm', '2026-10-23T16:00'],
    ['4 pm', '2026-10-23T16:00'],
    ['4:30pm', '2026-10-23T16:30'],
    ['14:30', '2026-10-23T14:30'],
    ['00:30', '2026-10-23T00:30'],
    ['9am', '2026-10-23T09:00'],
  ])('@%s is today at that time', (query, expected) => {
    expect(stored(query)).toBe(expected);
  });
});

describe('a plain number beside a date is an hour of the 24-hour clock', () => {
  it.each<[string, string]>([
    ['12 tomorrow', '2026-10-24T12:00'],
    ['tomorrow 12', '2026-10-24T12:00'],
    ['tomorrow 4', '2026-10-24T04:00'],
    ['16 tomorrow', '2026-10-24T16:00'],
    ['tomorrow 0', '2026-10-24T00:00'],
    ['tomorrow 23', '2026-10-24T23:00'],
    ['next month 14', '2026-11-23T14:00'],
    ['9 next friday', '2026-10-30T09:00'],
    ['in 3 weeks 18', '2026-11-13T18:00'],
  ])('@%s', (query, expected) => {
    expect(stored(query)).toBe(expected);
  });

  it('both orders agree, and agree with the written-out forms at noon and in the afternoon', () => {
    expect(stored('12 tomorrow')).toBe(stored('tomorrow 12'));
    expect(stored('tomorrow 16')).toBe(stored('tomorrow 4pm'));
    expect(stored('tomorrow 12')).toBe(stored('tomorrow 12pm'));
  });

  it('a number alone is still read as before: an hour and a day of the month', () => {
    expect(getDateSuggestions('12', FRIDAY).map((s) => !!s.time)).toEqual([true, false]);
    expect(getDateSuggestions('16', FRIDAY).map((s) => !!s.time)).toEqual([false]);
  });
});

describe('12-hour and 24-hour readings', () => {
  it.each<[string, string]>([
    ['12am tomorrow', '2026-10-24T00:00'],
    ['12pm tomorrow', '2026-10-24T12:00'],
    ['12:30am tomorrow', '2026-10-24T00:30'],
    ['12:30pm tomorrow', '2026-10-24T12:30'],
    ['1am tomorrow', '2026-10-24T01:00'],
    ['11pm tomorrow', '2026-10-24T23:00'],
    ['12 am tomorrow', '2026-10-24T00:00'],
    ['tomorrow 12 pm', '2026-10-24T12:00'],
    ['tomorrow 23:59', '2026-10-24T23:59'],
    ['tomorrow 7:30', '2026-10-24T07:30'],
    ['tomorrow 12:30', '2026-10-24T12:30'],
  ])('@%s', (query, expected) => {
    expect(stored(query)).toBe(expected);
  });

  it('a time with a space before am / pm reads like one without', () => {
    expect(stored('4 pm tomorrow')).toBe(stored('4pm tomorrow'));
    expect(stored('next friday 9 am')).toBe(stored('next friday 9am'));
  });
});

describe('a partly typed next / last beside a time offers its candidates with that time', () => {
  it.each(['12 next w', '4pm next w', 'next w 4pm', 'next w 12'])('@%s', (query) => {
    const suggestions = getDateSuggestions(query, FRIDAY);
    expect(suggestions.map((s) => s.phrase)).toEqual(['Next week', 'Next Wednesday']);
    expect(suggestions.every((s) => s.time !== undefined)).toBe(true);
  });

  it('keeps the typed time on every candidate, stored canonically', () => {
    const times = getDateSuggestions('12 next w', FRIDAY).map((s) => serializeDateReference(suggestionReference(s)));
    expect(times).toEqual(['2026-10-26T12:00', '2026-10-28T12:00']);
    expect(stored('next w 4pm')).toBe('2026-10-26T16:00');
  });
});

describe('an incomplete or invalid expression is not guessed at', () => {
  it.each([
    'next month 4:',
    'next month 4:3',
    '4pm next',
    'in 3 4pm',
    '4pm 5pm',
    'tomorrow 24',
    'tomorrow 25',
    '99 tomorrow',
    'in 3',
    'next 4',
    'tomorrow 25:00',
    'tomorrow 24:00',
    'tomorrow 14:75',
    'tomorrow 13pm',
    'tomorrow 0pm',
    'tomorrow 13:30pm',
    'tomorrow 4pm 5pm',
    'foo 4pm',
    '4pm foo',
    'this week 4pm',
  ])('@%s offers nothing', (query) => {
    expect(getDateSuggestions(query, FRIDAY)).toEqual([]);
  });

  it('a date word of one letter is still being typed, and offers no time suggestion', () => {
    expect(getDateSuggestions('4pm t', FRIDAY)).toEqual([]);
  });
});

describe('what was already supported is unchanged', () => {
  it('date-only expressions store a date only', () => {
    for (const query of ['tomorrow', 'next month', 'next friday', 'in 3 weeks', 'fri', '24']) {
      const [first] = getDateSuggestions(query, FRIDAY);
      expect(first!.time, query).toBeUndefined();
      expect(serializeDateReference(suggestionReference(first!)), query).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('a bare number is still an hour and a day of the month, and 13+ a day only', () => {
    const [time, date] = getDateSuggestions('2', FRIDAY);
    expect(time).toMatchObject({ time: { hour24: 2, minute: 0 } });
    expect(date!.time).toBeUndefined();
    expect(getDateSuggestions('24', FRIDAY)).toHaveLength(1);
  });

  it('the legacy month grammar still reads a day and a month', () => {
    expect(getDateSuggestions('12 mar', FRIDAY)[0]!.isoDate).toBe('2027-03-12');
    expect(getDateSuggestions('12 a', FRIDAY).every((s) => s.time === undefined)).toBe(true);
  });
});

describe('display follows the locale and the date format', () => {
  it('a row shows the date and the time in the locale’s own clock', () => {
    const [suggestion] = getDateSuggestions('next month 2pm', FRIDAY);
    expect(dateRow(suggestion!, FRIDAY).title).toMatch(/2:00\s?PM$/);
    setSystemLocaleOverride('de-DE');
    expect(dateRow(suggestion!, FRIDAY).title).toMatch(/14:00$/);
  });
});
