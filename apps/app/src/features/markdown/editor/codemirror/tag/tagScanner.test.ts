import { describe, expect, it } from 'vitest';

import { isValidTagPrecedingContext, scanTag } from './tagScanner';

/**
 * Pure scanner tests — no CM6/Lezer runtime involved. Every identifier
 * rule traced directly against `TagExtractor.ts`'s own already-shipped
 * regex (`/(^|\s)#([a-zA-Z0-9_-]+)/g`), not invented independently.
 */

describe('scanTag', () => {
  it('matches a simple identifier', () => {
    expect(scanTag('#tag', 0)).toEqual({ name: 'tag', end: 4 });
  });

  it('matches an identifier with a hyphen', () => {
    expect(scanTag('#tag-name', 0)).toEqual({ name: 'tag-name', end: 9 });
  });

  it('matches an identifier with an underscore', () => {
    expect(scanTag('#tag_name', 0)).toEqual({ name: 'tag_name', end: 9 });
  });

  it('matches an identifier with trailing digits', () => {
    expect(scanTag('#tag123', 0)).toEqual({ name: 'tag123', end: 7 });
  });

  it('matches only up to the first invalid character', () => {
    expect(scanTag('#tag!', 0)).toEqual({ name: 'tag', end: 4 });
  });

  it('matches starting at a non-zero offset', () => {
    expect(scanTag('foo #tag', 4)).toEqual({ name: 'tag', end: 8 });
  });

  it('returns null when there is no # at the given offset', () => {
    expect(scanTag('tag', 0)).toBeNull();
  });

  it('returns null for a bare # with nothing valid after it', () => {
    expect(scanTag('#', 0)).toBeNull();
  });

  it('returns null when # is immediately followed by whitespace', () => {
    expect(scanTag('# tag', 0)).toBeNull();
  });

  it('returns null when # is immediately followed by punctuation', () => {
    expect(scanTag('#!', 0)).toBeNull();
  });

  it('does not include a dot, slash, or pipe — no path/nesting/alias syntax', () => {
    expect(scanTag('#tag.name', 0)).toEqual({ name: 'tag', end: 4 });
    expect(scanTag('#tag/name', 0)).toEqual({ name: 'tag', end: 4 });
    expect(scanTag('#tag|alias', 0)).toEqual({ name: 'tag', end: 4 });
  });
});

describe('isValidTagPrecedingContext', () => {
  it('accepts undefined (start of content)', () => {
    expect(isValidTagPrecedingContext(undefined)).toBe(true);
  });

  it('accepts a plain space', () => {
    expect(isValidTagPrecedingContext(' ')).toBe(true);
  });

  it('accepts a newline — matches TagExtractor’s \\s, which already includes \\n', () => {
    expect(isValidTagPrecedingContext('\n')).toBe(true);
  });

  it('accepts a tab', () => {
    expect(isValidTagPrecedingContext('\t')).toBe(true);
  });

  it('rejects an ordinary letter — foo#tag must not match', () => {
    expect(isValidTagPrecedingContext('o')).toBe(false);
  });

  it('rejects punctuation', () => {
    expect(isValidTagPrecedingContext(']')).toBe(false);
  });
});
