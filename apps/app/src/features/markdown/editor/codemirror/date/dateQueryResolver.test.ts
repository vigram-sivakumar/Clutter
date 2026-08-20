import { describe, expect, it } from 'vitest';

import { resolveDateQuery } from './dateQueryResolver';

// Thursday, 2026-08-20 — same fixed reference date dateSuggestion.test.ts uses.
const REFERENCE = new Date(2026, 7, 20);

describe('resolveDateQuery', () => {
  describe('time', () => {
    it('@1 → Today 1:00 AM (bare hour with no suffix defaults to AM, except 12)', () => {
      const result = resolveDateQuery('1', REFERENCE);
      expect(result).toEqual({ isoDate: '2026-08-20', label: 'Today 1:00 AM' });
    });

    it('@12 → Today 12:00 PM (bare 12 defaults to noon/PM)', () => {
      const result = resolveDateQuery('12', REFERENCE);
      expect(result).toEqual({ isoDate: '2026-08-20', label: 'Today 12:00 PM' });
    });

    it('@1p → Today 1:00 PM (explicit suffix overrides the default)', () => {
      expect(resolveDateQuery('1p', REFERENCE)).toEqual({ isoDate: '2026-08-20', label: 'Today 1:00 PM' });
    });

    it('@12p → Today 12:00 PM', () => {
      expect(resolveDateQuery('12p', REFERENCE)).toEqual({ isoDate: '2026-08-20', label: 'Today 12:00 PM' });
    });

    it('@1:30 → Today 1:30 AM', () => {
      expect(resolveDateQuery('1:30', REFERENCE)).toEqual({ isoDate: '2026-08-20', label: 'Today 1:30 AM' });
    });

    it('@1:30p → Today 1:30 PM', () => {
      expect(resolveDateQuery('1:30p', REFERENCE)).toEqual({ isoDate: '2026-08-20', label: 'Today 1:30 PM' });
    });

    it('@12a → Today 12:00 AM (explicit "a" beats the bare-12-defaults-PM rule)', () => {
      expect(resolveDateQuery('12a', REFERENCE)).toEqual({ isoDate: '2026-08-20', label: 'Today 12:00 AM' });
    });

    it('a bare number outside 1–12 (e.g. @23) is not a valid time and offers nothing', () => {
      expect(resolveDateQuery('23', REFERENCE)).toBeNull();
    });

    it('@0 is not a valid hour and offers nothing', () => {
      expect(resolveDateQuery('0', REFERENCE)).toBeNull();
    });

    it('an out-of-range minute (@1:75) offers nothing', () => {
      expect(resolveDateQuery('1:75', REFERENCE)).toBeNull();
    });
  });

  describe('month alone', () => {
    it('@mar → next March on today\'s day-of-month, jumping to next year since March 20 2026 has already passed', () => {
      expect(resolveDateQuery('mar', REFERENCE)).toEqual({ isoDate: '2027-03-20', label: 'March 20, 2027' });
    });

    it('@march → same result as the abbreviation', () => {
      expect(resolveDateQuery('march', REFERENCE)).toEqual({ isoDate: '2027-03-20', label: 'March 20, 2027' });
    });

    it('@sep → next September on today\'s day-of-month, still this year (Sept 20 2026 is in the future)', () => {
      expect(resolveDateQuery('sep', REFERENCE)).toEqual({ isoDate: '2026-09-20', label: 'September 20, 2026' });
    });

    it('@m → no result — ambiguous between March and May, and too short regardless', () => {
      expect(resolveDateQuery('m', REFERENCE)).toBeNull();
    });

    it('@s → no result — too short', () => {
      expect(resolveDateQuery('s', REFERENCE)).toBeNull();
    });

    it('@se → no result — still too short (2 chars), even though "se" alone would be unique among months', () => {
      expect(resolveDateQuery('se', REFERENCE)).toBeNull();
    });

    it('if the exact date is today, resolves to today rather than jumping a year', () => {
      // Reference date IS August 20 — @aug should resolve to today, not next year.
      expect(resolveDateQuery('aug', REFERENCE)).toEqual({ isoDate: '2026-08-20', label: 'August 20, 2026' });
    });
  });

  describe('day + month', () => {
    it('@12 mar → March 12, next applicable year (March 12 2026 already passed)', () => {
      expect(resolveDateQuery('12 mar', REFERENCE)).toEqual({ isoDate: '2027-03-12', label: 'March 12, 2027' });
    });

    it('@mar 12 → same result regardless of token order', () => {
      expect(resolveDateQuery('mar 12', REFERENCE)).toEqual({ isoDate: '2027-03-12', label: 'March 12, 2027' });
    });

    it('@12 may → May 12, next applicable year', () => {
      expect(resolveDateQuery('12 may', REFERENCE)).toEqual({ isoDate: '2027-05-12', label: 'May 12, 2027' });
    });

    it('day/month combination still in the future this year resolves within this year', () => {
      expect(resolveDateQuery('25 dec', REFERENCE)).toEqual({ isoDate: '2026-12-25', label: 'December 25, 2026' });
    });

    it('an invalid calendar date (31 Feb) never rolls over — no result', () => {
      expect(resolveDateQuery('31 feb', REFERENCE)).toBeNull();
    });

    it('an ambiguous/too-short month word in a pair offers nothing (no arbitrary permutation)', () => {
      expect(resolveDateQuery('12 m', REFERENCE)).toBeNull();
    });
  });

  describe('year', () => {
    it('@2027 → no result — a bare year alone is not meaningful enough', () => {
      expect(resolveDateQuery('2027', REFERENCE)).toBeNull();
    });

    it('@2027 j → January 1, 2027 (lenient single-letter match, first calendar-order month wins)', () => {
      expect(resolveDateQuery('2027 j', REFERENCE)).toEqual({ isoDate: '2027-01-01', label: 'January 1, 2027' });
    });

    it('@2027 jan → January 1, 2027', () => {
      expect(resolveDateQuery('2027 jan', REFERENCE)).toEqual({ isoDate: '2027-01-01', label: 'January 1, 2027' });
    });

    it('@2027 jan 12 → January 12, 2027', () => {
      expect(resolveDateQuery('2027 jan 12', REFERENCE)).toEqual({
        isoDate: '2027-01-12',
        label: 'January 12, 2027',
      });
    });

    it('@2027 feb 29 → no result — 2027 is not a leap year, never silently rolled to March 1', () => {
      expect(resolveDateQuery('2027 feb 29', REFERENCE)).toBeNull();
    });

    it('day/month/year is not a supported permutation for the 3-token form', () => {
      expect(resolveDateQuery('12 jan 2027', REFERENCE)).toBeNull();
    });
  });

  describe('ISO date', () => {
    it('@2027-08 → no result — the dashed year-month fragment does not default to day 1', () => {
      expect(resolveDateQuery('2027-08', REFERENCE)).toBeNull();
    });

    it('@2027- → no result', () => {
      expect(resolveDateQuery('2027-', REFERENCE)).toBeNull();
    });

    it('@2027-08-20 → August 20, 2027, echoed back verbatim as its own label', () => {
      expect(resolveDateQuery('2027-08-20', REFERENCE)).toEqual({ isoDate: '2027-08-20', label: '2027-08-20' });
    });

    it('a calendar-invalid complete ISO date (2027-02-29) offers nothing', () => {
      expect(resolveDateQuery('2027-02-29', REFERENCE)).toBeNull();
    });

    it('a leap-year ISO date resolves normally (2028-02-29 is valid)', () => {
      expect(resolveDateQuery('2028-02-29', REFERENCE)).toEqual({ isoDate: '2028-02-29', label: '2028-02-29' });
    });
  });

  describe('malformed / out-of-grammar input', () => {
    it('an unrelated word offers nothing', () => {
      expect(resolveDateQuery('lunch', REFERENCE)).toBeNull();
    });

    it('more than 3 tokens offers nothing', () => {
      expect(resolveDateQuery('2027 jan 12 extra', REFERENCE)).toBeNull();
    });

    it('internal double-space garbage offers nothing', () => {
      expect(resolveDateQuery('12  mar', REFERENCE)).toBeNull();
    });

    it('trailing garbage after a complete expression offers nothing (e.g. "mar 12 lunch")', () => {
      expect(resolveDateQuery('mar 12 lunch', REFERENCE)).toBeNull();
    });
  });

  describe('local-date safety', () => {
    it('never derives a result via UTC-shifted math — resolved dates match the reference date\'s local calendar day', () => {
      const result = resolveDateQuery('20 aug', REFERENCE);
      expect(result?.isoDate).toBe('2026-08-20');
    });
  });
});
