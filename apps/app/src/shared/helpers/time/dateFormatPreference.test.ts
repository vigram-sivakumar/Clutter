// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { formatDateDisplay } from './dateDisplay';
import {
  DATE_FORMAT_CHOICES,
  DEFAULT_DATE_FORMAT_CHOICE,
  readDateFormatChoice,
  subscribeDateFormatChoice,
  writeDateFormatChoice,
} from './dateFormatPreference';

const KEY = 'clutter-date-format';

beforeEach(() => localStorage.clear());

describe('date format preference', () => {
  it('defaults to the relative format when nothing is saved', () => {
    expect(DEFAULT_DATE_FORMAT_CHOICE).toBe('relative');
    expect(readDateFormatChoice()).toBe('relative');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it.each(['', 'Full', 'iso', 'en-IN', 'null', '1'])(
    'treats an unrecognised saved value (%j) as the relative format',
    (value) => {
      localStorage.setItem(KEY, value);
      expect(readDateFormatChoice()).toBe('relative');
    }
  );

  it.each(DATE_FORMAT_CHOICES.filter((choice) => choice !== 'relative'))(
    'persists %s and reads it back after a restart',
    (choice) => {
      writeDateFormatChoice(choice);
      expect(localStorage.getItem(KEY)).toBe(choice);
      expect(readDateFormatChoice()).toBe(choice);
    }
  );

  it('choosing the default again removes the saved value', () => {
    writeDateFormatChoice('dmy');
    writeDateFormatChoice('relative');
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readDateFormatChoice()).toBe('relative');
  });

  it('offers exactly the seven choices, Relative first', () => {
    expect([...DATE_FORMAT_CHOICES]).toEqual([
      'relative',
      'full',
      'short',
      'weekday',
      'mdy',
      'dmy',
      'ymd',
    ]);
  });

  it('notifies subscribers of a change, until they unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDateFormatChoice(listener);
    writeDateFormatChoice('ymd');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    writeDateFormatChoice('mdy');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('is app-wide: it lives in the browser store, never under a Space', () => {
    writeDateFormatChoice('short');
    expect(Object.keys(localStorage)).toEqual([KEY]);
  });
});

describe('the formatter reads the saved preference when no format is passed', () => {
  const reference = new Date(2026, 9, 20, 11, 30);
  const long = (iso: string) => formatDateDisplay(iso, 'long', reference);

  it('is the relative format with nothing saved', () => {
    expect(long('2025-03-05')).toBe('5 Mar 2025');
    expect(long('2026-10-20')).toBe('Today');
  });

  it.each([
    ['full', '5 March 2025', '20 October'],
    ['short', '5 Mar 2025', '20 Oct'],
    ['weekday', 'Wed, 5 Mar 2025', 'Tue, 20 Oct'],
    ['mdy', '03/05/2025', '10/20/2026'],
    ['dmy', '05/03/2025', '20/10/2026'],
    ['ymd', '2025/03/05', '2026/10/20'],
    ['relative', '5 Mar 2025', 'Today'],
  ] as const)('%s', (choice, otherYear, today) => {
    writeDateFormatChoice(choice);
    expect(long('2025-03-05')).toBe(otherYear);
    expect(long('2026-10-20')).toBe(today);
  });

  it('goes back to the default when it is chosen again, with nothing left stored', () => {
    writeDateFormatChoice('ymd');
    writeDateFormatChoice('relative');
    expect(localStorage.getItem('clutter-date-format')).toBeNull();
    expect(long('2026-10-20')).toBe('Today');
  });
});
