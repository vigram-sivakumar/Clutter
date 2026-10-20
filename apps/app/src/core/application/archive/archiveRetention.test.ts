import { describe, expect, it } from 'vitest';

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
