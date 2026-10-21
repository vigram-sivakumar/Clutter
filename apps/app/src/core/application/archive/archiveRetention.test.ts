import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ARCHIVE_RETENTION_DAYS,
  archiveDateOf,
  isArchiveRetentionElapsed,
  toLocalIsoDate,
} from './archiveRetention';

/** The `archivedAt` Clutter records: an ISO timestamp, of a moment on the given local calendar day. */
const archivedOn = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour, 30).toISOString();
/** A moment on the given local calendar day. */
const on = (year: number, month: number, day: number, hour = 12) => new Date(year, month - 1, day, hour, 30);

describe('archiveRetention', () => {
  it('keeps items for 30 calendar days', () => {
    expect(ARCHIVE_RETENTION_DAYS).toBe(30);
  });

  describe('archiveDateOf', () => {
    it('is the local calendar date the recorded moment falls on, not its UTC date', () => {
      // 23:30 local on 5 March is already the 6th in UTC in zones east of it, and the 5th still in zones behind it.
      expect(archiveDateOf(archivedOn(2026, 3, 5, 23))).toBe('2026-03-05');
      expect(archiveDateOf(archivedOn(2026, 3, 5, 0))).toBe('2026-03-05');
    });

    it('accepts an already-plain calendar date', () => {
      expect(archiveDateOf('2026-03-05')).toBe('2026-03-05');
    });

    it.each([null, undefined, '', '   ', 'garbage', 'yesterday', '2026-13-45', '2026-02-30', '2026-02-29'])(
      'is null for a missing, blank, unparsable or impossible date (%j) — never guessed',
      (value) => {
        expect(archiveDateOf(value)).toBeNull();
      }
    );

    it('accepts a real leap day', () => {
      expect(archiveDateOf('2028-02-29')).toBe('2028-02-29');
    });
  });

  describe('isArchiveRetentionElapsed', () => {
    it('is not elapsed 29 days after the archive date, and is on the 30th and after', () => {
      const archived = archivedOn(2026, 6, 1);

      expect(isArchiveRetentionElapsed(archived, on(2026, 6, 30))).toBe(false); // 29 days
      expect(isArchiveRetentionElapsed(archived, on(2026, 7, 1))).toBe(true); // 30 days
      expect(isArchiveRetentionElapsed(archived, on(2026, 7, 2))).toBe(true); // 31 days
    });

    it('counts calendar days, not elapsed hours: late on the archive day to early on day 30 is 30 days', () => {
      const archived = archivedOn(2026, 6, 1, 23);

      expect(isArchiveRetentionElapsed(archived, on(2026, 7, 1, 0))).toBe(true); // 29 days 1 hour later
      expect(isArchiveRetentionElapsed(archived, on(2026, 6, 30, 23))).toBe(false); // 29 days exactly
    });

    it('crosses month boundaries by the calendar: 31 January is 30 days after 1 January', () => {
      const archived = archivedOn(2026, 1, 1);

      expect(isArchiveRetentionElapsed(archived, on(2026, 1, 30))).toBe(false);
      expect(isArchiveRetentionElapsed(archived, on(2026, 1, 31))).toBe(true);
    });

    it('crosses a year boundary', () => {
      const archived = archivedOn(2025, 12, 15);

      expect(isArchiveRetentionElapsed(archived, on(2026, 1, 13))).toBe(false); // 29 days
      expect(isArchiveRetentionElapsed(archived, on(2026, 1, 14))).toBe(true); // 30 days
    });

    it('counts a leap day: 30 days after 30 January 2028 is 29 February; after 31 January 2027 it is 2 March', () => {
      expect(isArchiveRetentionElapsed(archivedOn(2028, 1, 30), on(2028, 2, 28))).toBe(false);
      expect(isArchiveRetentionElapsed(archivedOn(2028, 1, 30), on(2028, 2, 29))).toBe(true);

      expect(isArchiveRetentionElapsed(archivedOn(2027, 1, 31), on(2027, 3, 1))).toBe(false); // 29 days
      expect(isArchiveRetentionElapsed(archivedOn(2027, 1, 31), on(2027, 3, 2))).toBe(true); // 30 days
    });

    it('counts across a daylight-saving change as whole calendar days', () => {
      // US clocks change on 8 March and 1 November 2026; the day is still one calendar day.
      expect(isArchiveRetentionElapsed(archivedOn(2026, 2, 6), on(2026, 3, 7))).toBe(false); // 29 days
      expect(isArchiveRetentionElapsed(archivedOn(2026, 2, 6), on(2026, 3, 8))).toBe(true); // 30 days
      expect(isArchiveRetentionElapsed(archivedOn(2026, 10, 2), on(2026, 10, 31))).toBe(false); // 29 days
      expect(isArchiveRetentionElapsed(archivedOn(2026, 10, 2), on(2026, 11, 1))).toBe(true); // 30 days
    });

    it('is never elapsed without a usable archive date', () => {
      for (const value of [null, undefined, '', 'garbage', '2026-13-45']) {
        expect(isArchiveRetentionElapsed(value, on(2099, 1, 1))).toBe(false);
      }
    });

    it('is never elapsed for a date in the future (a clock set back)', () => {
      expect(isArchiveRetentionElapsed(archivedOn(2026, 8, 1), on(2026, 6, 1))).toBe(false);
    });
  });

  describe('toLocalIsoDate', () => {
    it('zero-pads month and day in the local calendar', () => {
      expect(toLocalIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
      expect(toLocalIsoDate(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
    });
  });
});

/**
 * The 30-day rule counts local calendar days, so it must give the same answer for the same local dates in any time
 * zone — east of UTC, west of it, with and without daylight saving, and one with a half-hour offset. Each block
 * switches the process time zone, checks the switch really took effect (so a runner that ignored it would fail loudly
 * rather than pass vacuously), and runs the same boundary cases.
 */
const ZONES: readonly (readonly [zone: string, juneOffsetMinutes: number])[] = [
  ['UTC', 0],
  ['America/Los_Angeles', 420],
  ['Asia/Tokyo', -540],
  ['Pacific/Kiritimati', -840],
  ['America/St_Johns', 150],
  ['Australia/Lord_Howe', -630],
];

describe.each(ZONES)('the 30-day boundary in %s', (zone, juneOffsetMinutes) => {
  const original = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = zone;
    expect(new Date(2026, 5, 1, 12).getTimezoneOffset()).toBe(juneOffsetMinutes);
  });
  afterAll(() => {
    if (original === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = original;
    }
  });

  // Archived at the start of 1 June, local time.
  const archivedAtStartOfDay = () => new Date(2026, 5, 1, 0, 1).toISOString();
  // Archived at the very end of 1 June, local time.
  const archivedAtEndOfDay = () => new Date(2026, 5, 1, 23, 59).toISOString();

  it('29 calendar days old is not eligible, even at the last minute of that day', () => {
    expect(isArchiveRetentionElapsed(archivedAtStartOfDay(), new Date(2026, 5, 30, 23, 59))).toBe(false);
    expect(isArchiveRetentionElapsed(archivedAtEndOfDay(), new Date(2026, 5, 30, 23, 59))).toBe(false);
  });

  it('exactly 30 calendar days old is eligible from its first minute, even when fewer than 30 x 24 hours have passed', () => {
    // 23:59 on 1 June to 00:00 on 1 July is 29 days and 1 minute of elapsed time — and 30 calendar days.
    expect(isArchiveRetentionElapsed(archivedAtEndOfDay(), new Date(2026, 6, 1, 0, 0))).toBe(true);
    expect(isArchiveRetentionElapsed(archivedAtStartOfDay(), new Date(2026, 6, 1, 0, 0))).toBe(true);
  });

  it('31 calendar days old is eligible', () => {
    expect(isArchiveRetentionElapsed(archivedAtStartOfDay(), new Date(2026, 6, 2, 12, 0))).toBe(true);
  });

  it('crosses a month end, a year end and a leap day on the calendar', () => {
    expect(isArchiveRetentionElapsed(new Date(2026, 0, 1, 12).toISOString(), new Date(2026, 0, 30, 12))).toBe(false);
    expect(isArchiveRetentionElapsed(new Date(2026, 0, 1, 12).toISOString(), new Date(2026, 0, 31, 12))).toBe(true);
    expect(isArchiveRetentionElapsed(new Date(2025, 11, 15, 12).toISOString(), new Date(2026, 0, 13, 12))).toBe(false);
    expect(isArchiveRetentionElapsed(new Date(2025, 11, 15, 12).toISOString(), new Date(2026, 0, 14, 12))).toBe(true);
    expect(isArchiveRetentionElapsed(new Date(2028, 0, 30, 12).toISOString(), new Date(2028, 1, 28, 12))).toBe(false);
    expect(isArchiveRetentionElapsed(new Date(2028, 0, 30, 12).toISOString(), new Date(2028, 1, 29, 12))).toBe(true);
  });

  it('a future archive date is never eligible, however far ahead', () => {
    expect(isArchiveRetentionElapsed(new Date(2026, 5, 2, 0, 0).toISOString(), new Date(2026, 5, 1, 23, 59))).toBe(false);
    expect(isArchiveRetentionElapsed(new Date(2099, 0, 1, 12).toISOString(), new Date(2026, 6, 1, 12))).toBe(false);
  });

  it('an instant is read as the local calendar day it falls on in THIS zone, not its UTC date', () => {
    // The same instant (1 June, 03:00 UTC) is a different local day in different zones.
    const instant = '2026-06-01T03:00:00.000Z';
    const localDay = archiveDateOf(instant);

    expect(localDay).toBe(
      { UTC: '2026-06-01', 'America/Los_Angeles': '2026-05-31', 'Asia/Tokyo': '2026-06-01', 'Pacific/Kiritimati': '2026-06-01', 'America/St_Johns': '2026-06-01', 'Australia/Lord_Howe': '2026-06-01' }[zone]
    );
  });

  it('a date with no time reads as that calendar day in any zone', () => {
    expect(archiveDateOf('2026-06-01')).toBe('2026-06-01');
    expect(isArchiveRetentionElapsed('2026-06-01', new Date(2026, 5, 30, 12))).toBe(false);
    expect(isArchiveRetentionElapsed('2026-06-01', new Date(2026, 6, 1, 12))).toBe(true);
  });
});
