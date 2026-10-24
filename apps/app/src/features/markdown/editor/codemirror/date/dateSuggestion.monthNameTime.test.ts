// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeWeekStart } from '@features/daily-notes/calendar/weekStart';
import { setSystemLocaleOverride } from '@shared/helpers/time/dateLocale';
import { writeDateFormatChoice } from '@shared/helpers/time/dateFormatPreference';
import { serializeDateReference } from '@shared/helpers/time/dateReference';
import { getDateSuggestions, suggestionReference } from './dateSuggestion';

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

/** What accepting the first suggestion would store, or null when nothing is offered. */
const stored = (query: string, reference: Date = FRIDAY): string | null => {
  const [first] = getDateSuggestions(query, reference);
  return first ? serializeDateReference(suggestionReference(first)) : null;
};

describe('a month-name date with a time, in either word order', () => {
  it.each<[string, string]>([
    ['12 nov 12pm', '2026-11-12T12:00'],
    ['12pm nov 12', '2026-11-12T12:00'],
    ['nov 12 12pm', '2026-11-12T12:00'],
    ['12pm 12 nov', '2026-11-12T12:00'],
    ['12 nov 4pm', '2026-11-12T16:00'],
    ['4pm 12 nov', '2026-11-12T16:00'],
    ['nov 11 4pm', '2026-11-11T16:00'],
    ['4pm nov 11', '2026-11-11T16:00'],
    ['12pm nov 11', '2026-11-11T12:00'],
    ['11 nov 12am', '2026-11-11T00:00'],
    ['11 nov 12:00', '2026-11-11T12:00'],
    ['11 nov 14:30', '2026-11-11T14:30'],
    ['11 nov 4:30pm', '2026-11-11T16:30'],
    ['14:30 nov 11', '2026-11-11T14:30'],
    ['11 nov 4 pm', '2026-11-11T16:00'],
    ['4 pm 11 nov', '2026-11-11T16:00'],
    ['12 november 9am', '2026-11-12T09:00'],
    ['mar 3 9am', '2027-03-03T09:00'],
    ['9am march 3', '2027-03-03T09:00'],
  ])('%s is stored as %s', (query, expected) => {
    expect(stored(query)).toBe(expected);
  });
});

describe('a month-name date alone', () => {
  it.each<[string, string]>([
    ['nov 12', '2026-11-12'],
    ['12 nov', '2026-11-12'],
    ['11 nov', '2026-11-11'],
  ])('%s is stored as %s, without a time', (query, expected) => {
    expect(stored(query)).toBe(expected);
  });
});

describe('a bare number beside a month-name date is never a time', () => {
  it.each<[string, string]>([
    ['12 nov 12', '2026-11-12'],
    ['11 nov 12', '2026-11-11'],
    ['nov 11 12', '2026-11-11'],
    ['12 11 nov', '2026-11-11'],
    ['11 nov 4', '2026-11-11'],
    ['11 nov 23', '2026-11-11'],
  ])('%s is the date only (%s)', (query, expected) => {
    const suggestions = getDateSuggestions(query, FRIDAY);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.time).toBeUndefined();
    expect(stored(query)).toBe(expected);
  });
});

describe('yearless dates resolve to the next occurrence', () => {
  it('a month and day already past this year go to next year, with the time kept', () => {
    expect(stored('12 sep 9am')).toBe('2027-09-12T09:00');
    expect(stored('9am sep 12')).toBe('2027-09-12T09:00');
  });

  it('today itself stays this year', () => {
    expect(stored('23 oct 9am')).toBe('2026-10-23T09:00');
  });

  it('across a year boundary: late December to January', () => {
    expect(stored('2 jan 8pm', new Date(2026, 11, 30))).toBe('2027-01-02T20:00');
  });
});

describe('incomplete or invalid input stays quiet', () => {
  it.each(['12 n 12pm', '12 no 4pm', '12 nov 25:00', '12 nov 13pm', '31 nov 12pm', '12 nov 12:60'])(
    '%s offers no time suggestion',
    (query) => {
      expect(getDateSuggestions(query, FRIDAY).filter((s) => s.time)).toEqual([]);
    }
  );

  it('a month with a time but no day is not guessed', () => {
    expect(getDateSuggestions('nov 12pm', FRIDAY).filter((s) => s.time)).toEqual([]);
  });
});
