// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeWeekStart } from '@features/daily-notes/calendar/weekStart';
import { setSystemLocaleOverride } from '@shared/helpers/time/dateLocale';
import { writeDateFormatChoice } from '@shared/helpers/time/dateFormatPreference';
import { dateRow } from './dateCompletionRow';
import { getDateSuggestions } from './dateSuggestion';

// Friday, 2026-10-23. Week starts Monday: next week is Mon 10-26, last week Mon 10-12.
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

const phrases = (query: string, reference: Date = FRIDAY) =>
  getDateSuggestions(query, reference).map((s) => [s.phrase ?? s.label, s.isoDate]);

describe('nothing is offered until the second word has begun', () => {
  it.each(['n', 'ne', 'nex', 'next', 'next ', 'l', 'la', 'las', 'last', 'last '])('@%s offers nothing', (query) => {
    expect(phrases(query)).toEqual([]);
  });

  it('and not for something that is not a word after next / last', () => {
    expect(phrases('next 3')).toEqual([]);
    expect(phrases('next week x')).toEqual([]);
    expect(phrases('nexts w')).toEqual([]);
  });
});

describe('@next + part of a word', () => {
  it.each(['w', 'we'])('@next %s: Next week, then Next Wednesday', (word) => {
    expect(phrases(`next ${word}`)).toEqual([
      ['Next week', '2026-10-26'],
      ['Next Wednesday', '2026-10-28'],
    ]);
  });

  it('@next wed: Next Wednesday only', () => {
    expect(phrases('next wed')).toEqual([['Next Wednesday', '2026-10-28']]);
  });

  it('@next week: Next week only', () => {
    expect(phrases('next week')).toEqual([['Next week', '2026-10-26']]);
  });

  it('@next m: Next month, then Next Monday', () => {
    expect(phrases('next m')).toEqual([
      ['Next month', '2026-11-23'],
      ['Next Monday', '2026-10-26'],
    ]);
  });

  it('@next mo: Next month only', () => {
    expect(phrases('next mo')).toEqual([['Next month', '2026-11-23']]);
  });

  it('@next mon is Monday, as `mon` is everywhere else, and not the month', () => {
    expect(phrases('next mon')).toEqual([['Next Monday', '2026-10-26']]);
  });

  it('@next y: Next year; a letter nothing starts with offers nothing', () => {
    expect(phrases('next y')).toEqual([['Next year', '2027-10-23']]);
    expect(phrases('next z')).toEqual([]);
  });
});

describe('@last', () => {
  it('@last w: Last week, then Last Wednesday', () => {
    expect(phrases('last w')).toEqual([
      ['Last week', '2026-10-12'],
      ['Last Wednesday', '2026-10-21'],
    ]);
    expect(phrases('last we')).toEqual(phrases('last w'));
  });

  it('@last m: Last month, then Last Monday', () => {
    expect(phrases('last m')).toEqual([
      ['Last month', '2026-09-23'],
      ['Last Monday', '2026-10-19'],
    ]);
  });

  it('@last mo: Last month only', () => {
    expect(phrases('last mo')).toEqual([['Last month', '2026-09-23']]);
  });

  it('@last fri is Last Friday only: the most recent Friday strictly before today', () => {
    expect(phrases('last fri')).toEqual([['Last Friday', '2026-10-16']]);
    expect(phrases('last friday')).toEqual([['Last Friday', '2026-10-16']]);
    expect(phrases('last mon')).toEqual([['Last Monday', '2026-10-19']]);
  });

  it('@last s: the weekdays that start with it, the most recent first', () => {
    expect(phrases('last s')).toEqual([
      ['Last Sunday', '2026-10-18'],
      ['Last Saturday', '2026-10-17'],
    ]);
  });
});

describe('words that were already whole stay as they were', () => {
  it('@tom is Tomorrow and @yest is Yesterday', () => {
    expect(phrases('tom')).toEqual([['Tomorrow', '2026-10-24']]);
    expect(phrases('yest')).toEqual([['Yesterday', '2026-10-22']]);
  });

  it('a bare weekday is still the next one after today, with no phrase', () => {
    const [friday] = getDateSuggestions('fri', FRIDAY);
    expect(friday).toMatchObject({ isoDate: '2026-10-30' });
    expect(friday!.phrase).toBeUndefined();
  });

  it('numeric and time suggestions are untouched', () => {
    const [time, date] = getDateSuggestions('2', FRIDAY);
    expect(time).toMatchObject({ isoDate: '2026-10-23', time: { hour24: 2, minute: 0 } });
    expect(date).toMatchObject({ isoDate: '2026-11-02' });
    expect(getDateSuggestions('in 3', FRIDAY)).toEqual([]);
  });
});

describe('the week-start setting', () => {
  it('moves Next week, Last week and the weekday of next week', () => {
    writeWeekStart('sunday');
    expect(phrases('next w')).toEqual([
      ['Next week', '2026-10-25'],
      ['Next Wednesday', '2026-10-28'],
    ]);
    expect(phrases('last w')).toEqual([
      ['Last week', '2026-10-11'],
      ['Last Wednesday', '2026-10-21'],
    ]);
    // Sunday is the first day of next week now: Next Sunday and Next week are the same date.
    expect(phrases('next su')).toEqual([['Next Sunday', '2026-10-25']]);
  });
});

describe('rows and acceptance', () => {
  it('a row names the phrase and shows its date beside it, so two candidates can be told apart', () => {
    const [week, wednesday] = getDateSuggestions('next w', FRIDAY);
    expect(dateRow(week!, FRIDAY)).toMatchObject({ title: 'Next week', trailing: expect.any(String) });
    expect(dateRow(wednesday!, FRIDAY).title).toBe('Next Wednesday');
    expect(dateRow(week!, FRIDAY).trailing).not.toBe(dateRow(wednesday!, FRIDAY).trailing);
  });

  it('what a suggestion stores is its canonical date, whatever the phrase says', () => {
    for (const s of getDateSuggestions('next w', FRIDAY)) {
      expect(s.isoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.time).toBeUndefined();
    }
  });
});
