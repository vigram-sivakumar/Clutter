// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import {
  readWeekStart,
  startOfWeek,
  weekdayNames,
  writeWeekStart,
} from './weekStart';

const KEY = 'clutter-week-start';

beforeEach(() => localStorage.clear());

describe('week start preference', () => {
  it('defaults to Monday when nothing is saved', () => {
    expect(readWeekStart()).toBe('monday');
  });

  it.each(['', 'Sunday', 'tuesday', 'bogus', 'false', '0'])(
    'falls back to Monday for an invalid value (%j)',
    (value) => {
      localStorage.setItem(KEY, value);
      expect(readWeekStart()).toBe('monday');
    }
  );

  it('keeps an explicitly saved Sunday', () => {
    localStorage.setItem(KEY, 'sunday');
    expect(readWeekStart()).toBe('sunday');
  });

  it.each(['sunday', 'monday'] as const)(
    'persists %s and reads it back (a restart re-reads storage)',
    (value) => {
      writeWeekStart(value);
      expect(localStorage.getItem(KEY)).toBe(value);
      expect(readWeekStart()).toBe(value);
    }
  );
});

describe('weekdayNames', () => {
  it('lists Sunday through Saturday, or Monday through Sunday', () => {
    expect(weekdayNames('sunday')).toEqual([
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ]);
    expect(weekdayNames('monday')).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
  });
});

describe('startOfWeek', () => {
  it.each([
    ['sunday', new Date(2026, 6, 12), '2026-07-12'],
    ['sunday', new Date(2026, 6, 18), '2026-07-12'],
    ['monday', new Date(2026, 6, 12), '2026-07-06'],
    ['monday', new Date(2026, 6, 13), '2026-07-13'],
    ['monday', new Date(2026, 6, 1), '2026-06-29'],
    ['sunday', new Date(2024, 2, 1), '2024-02-25'], // across leap-day February
  ] as const)('%s-first: %s → %s', (weekStart, date, expected) => {
    const result = startOfWeek(new Date(date), weekStart);
    expect(
      [
        result.getFullYear(),
        String(result.getMonth() + 1).padStart(2, '0'),
        String(result.getDate()).padStart(2, '0'),
      ].join('-')
    ).toBe(expected);
  });
});

describe('weekdayNames in the locale', () => {
  it.each([
    ['en-IN', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], ['M', 'T', 'W', 'T', 'F', 'S', 'S']],
    ['en-US', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], ['M', 'T', 'W', 'T', 'F', 'S', 'S']],
    ['de-DE', ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'], ['M', 'D', 'M', 'D', 'F', 'S', 'S']],
  ])('%s, Monday first: names for tooltips, narrow letters for the header', (locale, long, narrow) => {
    expect(weekdayNames('monday', locale)).toEqual(long);
    expect(weekdayNames('monday', locale, 'narrow')).toEqual(narrow);
  });

  it('starts on Sunday when asked, in the same locale', () => {
    expect(weekdayNames('sunday', 'en-GB')[0]).toBe('Sunday');
    expect(weekdayNames('sunday', 'de-DE')[0]).toBe('Sonntag');
  });
});
