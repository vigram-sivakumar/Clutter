import { describe, expect, it } from 'vitest';

import { isValidDatePrecedingContext, scanDate } from './dateScanner';

describe('scanDate', () => {
  it('matches a shape-valid absolute date', () => {
    expect(scanDate('@2026-08-20', 0)).toEqual({ isoDate: '2026-08-20', end: 11 });
  });

  it('matches starting at a non-zero offset', () => {
    expect(scanDate('foo @2026-08-20', 4)).toEqual({ isoDate: '2026-08-20', end: 15 });
  });

  it('returns null when there is no @ at the given offset', () => {
    expect(scanDate('2026-08-20', 0)).toBeNull();
  });

  it('matches even a calendar-invalid-but-shape-valid date — shape only, not calendar validity', () => {
    // Parse-vs-validate: the grammar only checks shape; calendar
    // correctness is a separate, later concern (isValidCalendarDate).
    expect(scanDate('@2026-13-45', 0)).toEqual({ isoDate: '2026-13-45', end: 11 });
  });

  it('rejects when a letter immediately follows the date shape', () => {
    expect(scanDate('@2026-08-20x', 0)).toBeNull();
  });

  it('rejects when a digit immediately follows the date shape', () => {
    expect(scanDate('@2026-08-201', 0)).toBeNull();
  });

  it('accepts when punctuation immediately follows the date shape', () => {
    expect(scanDate('@2026-08-20.', 0)).toEqual({ isoDate: '2026-08-20', end: 11 });
  });

  it('accepts at end of input', () => {
    expect(scanDate('@2026-08-20', 0)).not.toBeNull();
  });

  it('does not match a slash-separated date — not an accepted format', () => {
    expect(scanDate('@20/08/2026', 0)).toBeNull();
  });

  it('does not match a relative keyword — Today/Tomorrow/Yesterday are never persistent Date shapes', () => {
    expect(scanDate('@Today', 0)).toBeNull();
    expect(scanDate('@Tomorrow', 0)).toBeNull();
    expect(scanDate('@Yesterday', 0)).toBeNull();
  });

  it('does not match a partial date shape', () => {
    expect(scanDate('@2026-08', 0)).toBeNull();
    expect(scanDate('@2026-', 0)).toBeNull();
  });
});

describe('isValidDatePrecedingContext', () => {
  it('accepts undefined (start of content)', () => {
    expect(isValidDatePrecedingContext(undefined)).toBe(true);
  });

  it('accepts a plain space', () => {
    expect(isValidDatePrecedingContext(' ')).toBe(true);
  });

  it('accepts a newline', () => {
    expect(isValidDatePrecedingContext('\n')).toBe(true);
  });

  it('rejects an ordinary letter — foo@2026-08-20 must not match', () => {
    expect(isValidDatePrecedingContext('o')).toBe(false);
  });
});
