import { afterEach, describe, expect, it } from 'vitest';

import { formatDateDisplay } from '@shared/helpers/time/dateDisplay';
import type { DateFormatChoice } from '@shared/helpers/time/dateFormatPreference';
import { getMonth } from './getMonth';
import { getWeek } from './getWeek';

// `new Date('YYYY-MM-DD')` is UTC midnight: west of UTC that is the previous local day, which used to put the
// first of a month in the previous month and a Sunday on a Saturday. The calendar must read a date-only value
// by its own components, in every timezone.
const ZONES = [
  'UTC',
  'Asia/Kolkata',
  'Pacific/Auckland',
  'America/New_York',
  'America/Los_Angeles',
  'Pacific/Honolulu',
];
const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const ids = (cells: readonly { fullDate: string }[]) =>
  cells.map((cell) => cell.fullDate);

describe.each(ZONES)('calendar helpers in %s', (zone) => {
  const useZone = () => {
    process.env.TZ = zone;
    // The zone really applied: a July date must carry that zone's offset, not the previous test's.
    expect(
      new Date(2026, 6, 15, 12).toLocaleString('en-US', { timeZone: zone })
    ).toContain('2026');
  };

  it('puts the 1st of a month in its own month, and lays out Aug 2026 (Sat start) in both modes', () => {
    useZone();
    const sunday = getMonth('2026-08-01', undefined, 'sunday');
    expect(sunday[0]!.map((c) => c.fullDate)).toEqual([
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
    ]);
    const monday = getMonth('2026-08-01', undefined, 'monday');
    expect(monday[0]!.map((c) => c.fullDate)).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
    expect(sunday.flat().filter((c) => !c.isOutsideMonth)).toHaveLength(31);
  });

  it('shows the same 42 days whichever day of the month is visible', () => {
    useZone();
    const first = ids(getMonth('2026-08-01', undefined, 'monday').flat());
    for (const day of ['2026-08-02', '2026-08-15', '2026-08-31']) {
      expect(ids(getMonth(day, undefined, 'monday').flat())).toEqual(first);
    }
  });

  it('starts the week containing a Sunday correctly in both modes', () => {
    useZone();
    expect(getWeek('2026-07-12', undefined, 'sunday')[0]!.fullDate).toBe(
      '2026-07-12'
    );
    expect(getWeek('2026-07-12', undefined, 'monday')[0]!.fullDate).toBe(
      '2026-07-06'
    );
    expect(getWeek('2026-07-13', undefined, 'monday')[0]!.fullDate).toBe(
      '2026-07-13'
    );
  });

  it('handles a leap-year February and a year boundary', () => {
    useZone();
    expect(
      getMonth('2028-02-10', undefined, 'sunday')
        .flat()
        .filter((c) => !c.isOutsideMonth)
    ).toHaveLength(29);
    expect(getWeek('2027-01-01', undefined, 'monday')[0]!.fullDate).toBe(
      '2026-12-28'
    );
  });

  it('formats relative days correctly, including across daylight-saving changes', () => {
    useZone();
    expect(
      formatDateDisplay('2026-08-20', 'long', new Date(2026, 7, 20, 23, 59))
    ).toBe('Today');
    expect(
      formatDateDisplay('2026-08-21', 'long', new Date(2026, 7, 20, 0, 1))
    ).toBe('Tomorrow');
    expect(
      formatDateDisplay('2026-03-09', 'long', new Date(2026, 2, 8, 23, 30))
    ).toBe('Tomorrow');
    expect(
      formatDateDisplay('2026-11-02', 'long', new Date(2026, 10, 1, 23, 30))
    ).toBe('Tomorrow');
    expect(
      formatDateDisplay('2026-08-01', 'heading', new Date(2026, 7, 20))
    ).toBe('Sat, 1 August');
  });

  it('writes a date-only value the same in every format, whatever the zone', () => {
    useZone();
    const reference = new Date(2026, 7, 20);
    const written = (format: DateFormatChoice) =>
      formatDateDisplay('2026-08-01', 'long', reference, {
        locale: 'en-GB',
        format,
      });

    expect(written('full')).toBe('1 August');
    expect(written('short')).toBe('1 Aug');
    expect(written('weekday')).toBe('Sat, 1 Aug');
    expect(written('mdy')).toBe('08/01/2026');
    expect(written('dmy')).toBe('01/08/2026');
    expect(written('ymd')).toBe('2026/08/01');
    expect(written('relative')).toBe('1 Aug');
  });

  it('uses the local calendar year at the turn of the year, never the UTC year', () => {
    useZone();
    // 23:30 on 31 December in this zone: in the zones behind UTC it is already 1 January there.
    const lateNewYearsEve = new Date(2026, 11, 31, 23, 30);
    const full = (iso: string) =>
      formatDateDisplay(iso, 'long', lateNewYearsEve, {
        locale: 'en-GB',
        format: 'full',
      });

    expect(full('2026-12-31')).toBe('31 December');
    expect(full('2027-01-01')).toBe('1 January 2027');

    const justAfterMidnight = new Date(2027, 0, 1, 0, 10);
    expect(
      formatDateDisplay('2027-01-01', 'long', justAfterMidnight, {
        locale: 'en-GB',
        format: 'full',
      })
    ).toBe('1 January');
    expect(
      formatDateDisplay('2026-12-31', 'long', justAfterMidnight, {
        locale: 'en-GB',
        format: 'full',
      })
    ).toBe('31 December 2026');
  });
});
