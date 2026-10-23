// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { COMPLETION_ICONS } from '../completionPopup/completionIcons';
import { setSystemLocaleOverride } from '@shared/helpers/time/dateLocale';
import { writeDateFormatChoice, type DateFormatChoice } from '@shared/helpers/time/dateFormatPreference';
import { dateRow } from './dateCompletionRow';
import { getDateSuggestions, type DateSuggestion } from './dateSuggestion';
import iconRegistryClock from '@shared/icon/svg/clock.svg?raw';

// Friday, 2026-10-23.
const FRIDAY = new Date(2026, 9, 23);

beforeEach(() => {
  setSystemLocaleOverride('en-US');
  writeDateFormatChoice('relative');
});
afterEach(() => {
  setSystemLocaleOverride(null);
  localStorage.clear();
});

const [time, date] = getDateSuggestions('2', FRIDAY) as [DateSuggestion, DateSuggestion];

describe('a time suggestion’s row', () => {
  it('reads "Today, 2:00 AM" in the system’s time format, with the clock icon the app already has', () => {
    const row = dateRow(time, FRIDAY);
    expect(row.title).toBe('Today, 2:00 AM');
    expect(row.iconSvg).toBe(COMPLETION_ICONS.clock);
    expect(COMPLETION_ICONS.clock).toBe(iconRegistryClock);
  });

  it('has no trailing note: the time is stored with the date now', () => {
    expect(dateRow(time, FRIDAY).trailing).toBeUndefined();
  });

  it('follows the locale’s own clock: 24-hour and 12-hour', () => {
    setSystemLocaleOverride('de-DE');
    expect(dateRow(time, FRIDAY).title).toMatch(/02:00$/);
    expect(dateRow(time, FRIDAY).title).not.toMatch(/AM|PM/i);
    setSystemLocaleOverride('en-US');
    expect(dateRow(time, FRIDAY).title).toMatch(/2:00\s?AM$/);
  });

  it('a noon and an afternoon time read in the same clock', () => {
    const [noon] = getDateSuggestions('12', FRIDAY);
    expect(dateRow(noon!, FRIDAY).title).toBe('Today, 12:00 PM');
    const [evening] = getDateSuggestions('7:30p', FRIDAY);
    expect(dateRow(evening!, FRIDAY).title).toBe('Today, 7:30 PM');
  });

  it('the day half follows the configured date format, the time half stays the clock', () => {
    writeDateFormatChoice('full');
    const title = dateRow(time, FRIDAY).title;
    expect(title).toMatch(/^October 23, /);
    expect(title).not.toMatch(/^Today/);
    expect(title).toMatch(/2:00\s?AM$/);
  });
});

describe('a date suggestion’s row', () => {
  it('has the calendar icon and no note, and is told apart from the time row by its icon and its text', () => {
    const row = dateRow(date, FRIDAY);
    expect(row.iconSvg).toBe(COMPLETION_ICONS.calendarBlank);
    expect(row.iconSvg).not.toBe(COMPLETION_ICONS.clock);
    expect(row.trailing).toBeUndefined();
    expect(row.title).not.toBe(dateRow(time, FRIDAY).title);
  });

  it.each<[DateFormatChoice, RegExp]>([
    ['full', /^November 2$/],
    ['mdy', /^11\/02\/2026$|^11\/2\/2026$/],
    ['dmy', /^02\/11\/2026$|^2\/11\/2026$/],
    ['ymd', /^2026[-/]11[-/]02$/],
  ])('shows November 2 as the %s format writes it, in the system’s locale', (format, expected) => {
    writeDateFormatChoice(format);
    expect(dateRow(date, FRIDAY).title).toMatch(expected);
  });

  it('follows the system locale’s own wording and order', () => {
    writeDateFormatChoice('full');
    setSystemLocaleOverride('en-US');
    const us = dateRow(date, FRIDAY).title;
    setSystemLocaleOverride('de-DE');
    const de = dateRow(date, FRIDAY).title;
    expect(us).not.toBe(de);
    expect(de).toMatch(/November/);
  });

  it('under the relative default, a date within the week reads as a word and a farther one as a date', () => {
    const [, tomorrowDate] = [null, getDateSuggestions('24', FRIDAY)[0]!];
    expect(dateRow(tomorrowDate, FRIDAY).title).toBe('Tomorrow');
    expect(dateRow(date, FRIDAY).title).not.toBe('Tomorrow');
    expect(dateRow(date, FRIDAY).title).toMatch(/2/);
  });

  it('inserts the canonical date, never what the row displays', () => {
    expect(date.isoDate).toBe('2026-11-02');
    expect(time.isoDate).toBe('2026-10-23');
    for (const suggestion of [time, date]) {
      expect(suggestion.isoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
