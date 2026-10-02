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

  it('accepts / - and . as separators', () => {
    expect(parseDateInput('15-9-2026', REF)).toBe('2026-09-15');
    expect(parseDateInput('15.9.2026', REF)).toBe('2026-09-15');
    expect(parseDateInput('15/9-2026', REF)).toBe('2026-09-15');
  });

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

  it('rejects month words that are too short or unknown', () => {
    expect(parseDateInput('15 Se 2026', REF)).toBeNull();
    expect(parseDateInput('15 Foo 2026', REF)).toBeNull();
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

describe('parseDateInput — incomplete input', () => {
  it.each(['', '1', '1/', '1/1', '1/1/', '1/1/2', '1/1/202', '15 Sep', 'abc'])(
    'returns null for %j',
    (text) => {
      expect(parseDateInput(text, REF)).toBeNull();
    }
  );
});
