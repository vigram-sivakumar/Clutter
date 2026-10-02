import { describe, expect, it } from 'vitest';

import { expandTwoDigitYear, parseDateInput } from './parseDateInput';

// Friday, 2 Oct 2026.
const REF = new Date(2026, 9, 2, 12);

describe('parseDateInput — numeric D/M/Y', () => {
  it('reads day before month, without zero-padding', () => {
    expect(parseDateInput('1/1/2026', REF)).toBe('2026-01-01');
    expect(parseDateInput('1/9/2026', REF)).toBe('2026-09-01');
    expect(parseDateInput('15/9/2026', REF)).toBe('2026-09-15');
  });

  it('accepts zero-padded parts', () => {
    expect(parseDateInput('15/09/2026', REF)).toBe('2026-09-15');
    expect(parseDateInput('01/09/2026', REF)).toBe('2026-09-01');
  });

  it.each(['01.02.26', '01/02/26', '01-02-26', '01 02 26', '1/2-26', '1, 2, 2026', '01  02  2026'])(
    'treats separators as interchangeable: %j',
    (text) => {
      expect(parseDateInput(text, REF)).toBe('2026-02-01');
    }
  );

  it('rejects dates that do not exist', () => {
    expect(parseDateInput('31/9/2026', REF)).toBeNull();
    expect(parseDateInput('29/2/2026', REF)).toBeNull();
    expect(parseDateInput('29/2/2028', REF)).toBe('2028-02-29');
    expect(parseDateInput('1/13/2026', REF)).toBeNull();
  });
});

describe('parseDateInput — two-digit years (POSIX %y: 00–68 → 20xx, 69–99 → 19xx)', () => {
  it('expands 00–68 into the 2000s', () => {
    expect(parseDateInput('1/1/29', REF)).toBe('2029-01-01');
    expect(parseDateInput('1/1/00', REF)).toBe('2000-01-01');
    expect(parseDateInput('1/1/68', REF)).toBe('2068-01-01');
  });

  it('expands 69–99 into the 1900s', () => {
    expect(parseDateInput('1/1/69', REF)).toBe('1969-01-01');
    expect(parseDateInput('1/1/99', REF)).toBe('1999-01-01');
  });

  it('is a fixed rule, independent of the reference date', () => {
    expect(expandTwoDigitYear(29)).toBe(2029);
    expect(parseDateInput('1/1/29', new Date(1990, 0, 1))).toBe('2029-01-01');
  });
});

describe('parseDateInput — other forms', () => {
  it('accepts D Month Y with a full or abbreviated month name', () => {
    expect(parseDateInput('15 Sep 2026', REF)).toBe('2026-09-15');
    expect(parseDateInput('15 Sept 2026', REF)).toBe('2026-09-15');
    expect(parseDateInput('15 September 2026', REF)).toBe('2026-09-15');
    expect(parseDateInput('15 sep 26', REF)).toBe('2026-09-15');
  });

  it.each(['1 feb 26', '01/feb/2026', '01.feb.2026', '1-february-2026', '1 FEB 2026'])(
    'accepts a month name with any separator: %j',
    (text) => {
      expect(parseDateInput(text, REF)).toBe('2026-02-01');
    }
  );

  it('accepts any month prefix unique to one month, and rejects ambiguous or unknown ones', () => {
    expect(parseDateInput('1 f 2026', REF)).toBe('2026-02-01');
    expect(parseDateInput('15 se 2026', REF)).toBe('2026-09-15');
    expect(parseDateInput('15 ma 2026', REF)).toBeNull();
    expect(parseDateInput('15 ju 2026', REF)).toBeNull();
    expect(parseDateInput('15 jun 2026', REF)).toBe('2026-06-15');
    expect(parseDateInput('15 foo 2026', REF)).toBeNull();
  });

  it('accepts a month name first', () => {
    expect(parseDateInput('feb 1', REF)).toBe('2026-02-01');
    expect(parseDateInput('feb 1 2026', REF)).toBe('2026-02-01');
    expect(parseDateInput('feb 1, 27', REF)).toBe('2027-02-01');
    expect(parseDateInput('feb 2027', REF)).toBe('2027-02-01');
  });

  it('accepts ISO YYYY-MM-DD', () => {
    expect(parseDateInput('2026-09-15', REF)).toBe('2026-09-15');
  });

  it('accepts Today / Tomorrow / Yesterday, the labels the formatter displays', () => {
    expect(parseDateInput('Today', REF)).toBe('2026-10-02');
    expect(parseDateInput('tomorrow', REF)).toBe('2026-10-03');
    expect(parseDateInput('Yesterday', REF)).toBe('2026-10-01');
  });
});

describe('parseDateInput — partial dates fill in from the reference date', () => {
  it('reads a day alone as that day of the current month', () => {
    expect(parseDateInput('01', REF)).toBe('2026-10-01');
    expect(parseDateInput('1', REF)).toBe('2026-10-01');
    expect(parseDateInput('15/', REF)).toBe('2026-10-15');
  });

  it('reads a day and month as that date this year', () => {
    expect(parseDateInput('01.02', REF)).toBe('2026-02-01');
    expect(parseDateInput('01/02', REF)).toBe('2026-02-01');
    expect(parseDateInput('01-02', REF)).toBe('2026-02-01');
    expect(parseDateInput('01 02', REF)).toBe('2026-02-01');
    expect(parseDateInput('1 feb', REF)).toBe('2026-02-01');
    expect(parseDateInput('1/1/', REF)).toBe('2026-01-01');
  });

  it('reads a month name alone as its 1st, this year', () => {
    expect(parseDateInput('feb', REF)).toBe('2026-02-01');
    expect(parseDateInput('february', REF)).toBe('2026-02-01');
  });
});

describe('parseDateInput — not (yet) a date', () => {
  it.each(['', '/', '0', '32', '31/9', '1/13', '1/1/2', '1/1/202', 'ma', 'abc', '2026', '2026-02', '1 2 3 4'])(
    'returns null for %j',
    (text) => {
      expect(parseDateInput(text, REF)).toBeNull();
    }
  );
});
