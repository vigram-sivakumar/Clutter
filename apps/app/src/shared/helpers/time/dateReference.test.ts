// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { writeDateFormatChoice } from './dateFormatPreference';
import { setSystemLocaleOverride } from './dateLocale';
import {
  dateReferenceToDate,
  formatClockTime,
  formatDateReferenceDisplay,
  isValidClockTime,
  isValidDateReference,
  parseDateReference,
  serializeDateReference,
} from './dateReference';

// Friday, 2026-10-23.
const TODAY = new Date(2026, 9, 23, 12, 0);

afterEach(() => {
  setSystemLocaleOverride(null);
  localStorage.clear();
});

describe('parsing and serializing', () => {
  it('a date-only reference round-trips unchanged', () => {
    expect(parseDateReference('2026-10-23')).toEqual({ isoDate: '2026-10-23' });
    expect(serializeDateReference({ isoDate: '2026-10-23' })).toBe('2026-10-23');
  });

  it('a timed reference round-trips as local wall-clock time with no zone', () => {
    expect(parseDateReference('2026-10-23T07:00')).toEqual({ isoDate: '2026-10-23', time: '07:00' });
    const text = serializeDateReference({ isoDate: '2026-10-23', time: '07:00' });
    expect(text).toBe('2026-10-23T07:00');
    expect(text).not.toMatch(/Z|[+-]\d{2}:?\d{2}$/);
  });

  it.each(['', '2026-10-23T', '2026-10-23T7:00', '2026-10-23T07:00Z', '2026-10-23 07:00', '10/23/2026'])(
    'does not parse %j',
    (text) => expect(parseDateReference(text)).toBeNull()
  );

  it('writes the hour and minute as 24-hour HH:mm', () => {
    expect(formatClockTime(7, 0)).toBe('07:00');
    expect(formatClockTime(0, 5)).toBe('00:05');
    expect(formatClockTime(19, 30)).toBe('19:30');
  });
});

describe('validity', () => {
  it.each(['00:00', '07:00', '12:00', '23:59'])('accepts the time %s', (time) => expect(isValidClockTime(time)).toBe(true));
  it.each(['24:00', '12:60', '7:00', '07:0', '7', 'ab:cd', '', '07:00:00'])('rejects the time %j', (time) =>
    expect(isValidClockTime(time)).toBe(false)
  );

  it('needs a real date and, when present, a real time', () => {
    expect(isValidDateReference({ isoDate: '2026-10-23' })).toBe(true);
    expect(isValidDateReference({ isoDate: '2026-10-23', time: '07:00' })).toBe(true);
    expect(isValidDateReference({ isoDate: '2026-13-45', time: '07:00' })).toBe(false);
    expect(isValidDateReference({ isoDate: '2026-10-23', time: '25:00' })).toBe(false);
  });
});

describe('the local Date a reference names', () => {
  it('is local midnight without a time and the local wall-clock time with one — never UTC-parsed', () => {
    const midnight = dateReferenceToDate({ isoDate: '2026-10-23' });
    expect([midnight.getFullYear(), midnight.getMonth(), midnight.getDate(), midnight.getHours()]).toEqual([2026, 9, 23, 0]);
    const timed = dateReferenceToDate({ isoDate: '2026-10-23', time: '19:30' });
    expect([timed.getDate(), timed.getHours(), timed.getMinutes()]).toEqual([23, 19, 30]);
  });
});

describe('display follows the preferences, storage does not', () => {
  const timed = { isoDate: '2026-10-23', time: '07:00' } as const;

  it('reads "Today, 7:00 AM" under the relative format and a 12-hour locale', () => {
    setSystemLocaleOverride('en-US');
    writeDateFormatChoice('relative');
    expect(formatDateReferenceDisplay(timed, TODAY)).toBe('Today, 7:00 AM');
  });

  it('writes the date in the chosen format, then the locale’s clock', () => {
    setSystemLocaleOverride('en-GB');
    writeDateFormatChoice('dmy');
    expect(formatDateReferenceDisplay({ isoDate: '2026-12-25', time: '07:00' }, TODAY)).toMatch(/^25\/12\/2026, 07:00$/);
  });

  it('a 24-hour locale shows no AM/PM, a 12-hour one does', () => {
    setSystemLocaleOverride('de-DE');
    expect(formatDateReferenceDisplay({ ...timed, time: '19:30' }, TODAY)).toMatch(/19:30$/);
    setSystemLocaleOverride('en-US');
    expect(formatDateReferenceDisplay({ ...timed, time: '19:30' }, TODAY)).toMatch(/7:30\s?PM$/);
  });

  it('a date-only reference shows no time', () => {
    setSystemLocaleOverride('en-US');
    writeDateFormatChoice('relative');
    expect(formatDateReferenceDisplay({ isoDate: '2026-10-23' }, TODAY)).toBe('Today');
  });

  it('changing the display preference never changes the stored text', () => {
    const stored = serializeDateReference(timed);
    writeDateFormatChoice('mdy');
    expect(serializeDateReference(timed)).toBe(stored);
    writeDateFormatChoice('full');
    expect(serializeDateReference(timed)).toBe('2026-10-23T07:00');
  });
});
