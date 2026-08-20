import { describe, expect, it } from 'vitest';

import { formatDateDisplay } from './dateDisplay';

// Thursday, 2026-08-20 — same fixed reference date the Date-autocomplete
// tests use, for consistency across the codebase's date-related suites.
const REFERENCE = new Date(2026, 7, 20);

describe('formatDateDisplay', () => {
  describe("mode: 'full' (Daily Note titles — always the complete date)", () => {
    it('today', () => {
      expect(formatDateDisplay('2026-08-20', 'full', REFERENCE)).toBe('Today, 20 August 2026');
    });

    it('tomorrow', () => {
      expect(formatDateDisplay('2026-08-21', 'full', REFERENCE)).toBe('Tomorrow, 21 August 2026');
    });

    it('yesterday', () => {
      expect(formatDateDisplay('2026-08-19', 'full', REFERENCE)).toBe('Yesterday, 19 August 2026');
    });

    it('another day within the current week (Saturday, 2 days after today)', () => {
      expect(formatDateDisplay('2026-08-22', 'full', REFERENCE)).toBe('Saturday, 22 August 2026');
    });

    it('another day within the current week, before today (Sunday, the start of this week)', () => {
      expect(formatDateDisplay('2026-08-16', 'full', REFERENCE)).toBe('Sunday, 16 August 2026');
    });

    it('another day within the current week (Monday, 4 days after today)', () => {
      expect(formatDateDisplay('2026-08-24', 'full', REFERENCE)).toBe('Monday, 24 August 2026');
    });

    it('a date outside the current week/year still gets its weekday as the day identity — never dropped', () => {
      expect(formatDateDisplay('2027-08-12', 'full', REFERENCE)).toBe('Thursday, 12 August 2027');
    });

    it('always includes the year, even for a date in the current year outside the current week', () => {
      expect(formatDateDisplay('2026-01-05', 'full', REFERENCE)).toBe('Monday, 5 January 2026');
    });

    it('week boundary: the Sunday two weeks out is outside the current week, but still gets its weekday identity', () => {
      expect(formatDateDisplay('2026-08-30', 'full', REFERENCE)).toBe('Sunday, 30 August 2026');
    });

    it('month boundary: the day after this week that also crosses into the next month', () => {
      // Reference last day of August's week (Sat 2026-08-29 is within the
      // current week starting Sun 2026-08-23); Sept 1 falls outside it.
      const lateAugust = new Date(2026, 7, 25); // Tue, 2026-08-25
      expect(formatDateDisplay('2026-09-01', 'full', lateAugust)).toBe('Tuesday, 1 September 2026');
    });

    it('year boundary: a date just past New Year, outside the current week', () => {
      const lateDecember = new Date(2026, 11, 20); // Sun, 2026-12-20
      expect(formatDateDisplay('2027-01-03', 'full', lateDecember)).toBe('Sunday, 3 January 2027');
    });
  });

  describe("mode: 'compact' (@date / task due dates — space-constrained)", () => {
    it('today', () => {
      expect(formatDateDisplay('2026-08-20', 'compact', REFERENCE)).toBe('Today');
    });

    it('tomorrow', () => {
      expect(formatDateDisplay('2026-08-21', 'compact', REFERENCE)).toBe('Tomorrow');
    });

    it('yesterday', () => {
      expect(formatDateDisplay('2026-08-19', 'compact', REFERENCE)).toBe('Yesterday');
    });

    it('another day within the current week shows just the bare weekday name, no date', () => {
      expect(formatDateDisplay('2026-08-22', 'compact', REFERENCE)).toBe('Saturday');
    });

    it('a date outside the current week, in the current year, omits the year', () => {
      expect(formatDateDisplay('2026-12-25', 'compact', REFERENCE)).toBe('25 December');
    });

    it('a date outside the current week, in a different year, includes the year', () => {
      expect(formatDateDisplay('2027-08-12', 'compact', REFERENCE)).toBe('12 August 2027');
    });

    it('year boundary: a date in the next year still gets a year suffix even if otherwise close by', () => {
      const lateDecember = new Date(2026, 11, 20); // Sun, 2026-12-20
      expect(formatDateDisplay('2027-01-03', 'compact', lateDecember)).toBe('3 January 2027');
    });

    it('month boundary: a date in the next month but the same year omits the year', () => {
      const lateAugust = new Date(2026, 7, 25); // Tue, 2026-08-25
      expect(formatDateDisplay('2026-09-01', 'compact', lateAugust)).toBe('1 September');
    });

    it('week boundary: the day right after the current week ends is "other", not a weekday label', () => {
      expect(formatDateDisplay('2026-08-30', 'compact', REFERENCE)).toBe('30 August');
    });
  });

  describe("mode: 'condensed' (Tasks sidebar — narrower than 'compact')", () => {
    it('today', () => {
      expect(formatDateDisplay('2026-08-20', 'condensed', REFERENCE)).toBe('Today');
    });

    it('tomorrow', () => {
      expect(formatDateDisplay('2026-08-21', 'condensed', REFERENCE)).toBe('Tomorrow');
    });

    it('yesterday', () => {
      expect(formatDateDisplay('2026-08-19', 'condensed', REFERENCE)).toBe('Yesterday');
    });

    it('another day within the current week shows just the bare weekday name, no date', () => {
      expect(formatDateDisplay('2026-08-22', 'condensed', REFERENCE)).toBe('Saturday');
    });

    it('a date outside the current week, in the current year, uses an abbreviated month and omits the year', () => {
      expect(formatDateDisplay('2026-08-27', 'condensed', REFERENCE)).toBe('27 Aug');
    });

    it('a date outside the current week, in a different year, uses an abbreviated month and includes the year', () => {
      expect(formatDateDisplay('2027-08-27', 'condensed', REFERENCE)).toBe('27 Aug 2027');
    });

    it('every month abbreviates to its short form', () => {
      expect(formatDateDisplay('2026-09-30', 'condensed', REFERENCE)).toBe('30 Sep');
      expect(formatDateDisplay('2027-11-19', 'condensed', REFERENCE)).toBe('19 Nov 2027');
    });

    it("shares the exact same date-relationship classification as 'compact' — only the month-label form differs", () => {
      for (const isoDate of ['2026-08-20', '2026-08-21', '2026-08-19', '2026-08-22', '2026-08-30']) {
        const compact = formatDateDisplay(isoDate, 'compact', REFERENCE);
        const condensed = formatDateDisplay(isoDate, 'condensed', REFERENCE);
        // Bare-word day-identity cases (today/tomorrow/yesterday/weekday)
        // are byte-identical between the two modes — only the "outside the
        // current week" fallback's month name ever differs.
        if (!/^\d/.test(compact)) {
          expect(condensed).toBe(compact);
        }
      }
    });
  });

  describe('week-boundary edges shared by both modes', () => {
    it('the last day of the current week (Saturday) is still classified as within-week', () => {
      expect(formatDateDisplay('2026-08-22', 'full', REFERENCE)).toBe('Saturday, 22 August 2026');
      expect(formatDateDisplay('2026-08-22', 'compact', REFERENCE)).toBe('Saturday');
    });

    it('the first day of the next week (Sunday) is outside the current week — compact drops the weekday, full keeps it', () => {
      expect(formatDateDisplay('2026-08-23', 'full', REFERENCE)).toBe('Sunday, 23 August 2026');
      expect(formatDateDisplay('2026-08-23', 'compact', REFERENCE)).toBe('23 August');
    });
  });

  it('never derives "today" via UTC-shifted math — classification matches the reference date\'s local calendar day', () => {
    expect(formatDateDisplay('2026-08-20', 'compact', REFERENCE)).toBe('Today');
  });
});
