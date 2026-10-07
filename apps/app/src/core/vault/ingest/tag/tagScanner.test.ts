import { describe, expect, it } from 'vitest';

import { isTagQueryText, isValidTagPrecedingContext, MAX_TAG_LENGTH, scanTag } from './tagScanner';

describe('scanTag', () => {
  it('scans a simple tag', () => {
    expect(scanTag('#tag', 0)).toEqual({ name: 'tag', end: 4 });
  });

  it('accepts hyphens, underscores and digits after a letter', () => {
    expect(scanTag('#tag-name', 0)).toEqual({ name: 'tag-name', end: 9 });
    expect(scanTag('#tag_name', 0)).toEqual({ name: 'tag_name', end: 9 });
    expect(scanTag('#tag123', 0)).toEqual({ name: 'tag123', end: 7 });
    expect(scanTag('#2024-q1', 0)).toEqual({ name: '2024-q1', end: 8 });
  });

  it('keeps Unicode letters whole instead of truncating at the first non-ASCII character', () => {
    expect(scanTag('#café', 0)).toEqual({ name: 'café', end: 5 });
    expect(scanTag('#日本語', 0)).toEqual({ name: '日本語', end: 4 });
    expect(scanTag('#naïve-design', 0)).toEqual({ name: 'naïve-design', end: 13 });
    // Combining mark (decomposed é).
    expect(scanTag('#café', 0)).toEqual({ name: 'café', end: 6 });
  });

  it('ends at sentence punctuation, leaving it outside the tag', () => {
    expect(scanTag('#tag!', 0)).toEqual({ name: 'tag', end: 4 });
    expect(scanTag('#tag.', 0)).toEqual({ name: 'tag', end: 4 });
    expect(scanTag('#tag,', 0)).toEqual({ name: 'tag', end: 4 });
    expect(scanTag('#tag)', 0)).toEqual({ name: 'tag', end: 4 });
    expect(scanTag('#tag:', 0)).toEqual({ name: 'tag', end: 4 });
  });

  it('a dot or pipe ends the tag (#foo.bar is #foo then ".bar")', () => {
    expect(scanTag('#tag.name', 0)).toEqual({ name: 'tag', end: 4 });
    expect(scanTag('#tag|alias', 0)).toEqual({ name: 'tag', end: 4 });
  });

  it('drops trailing separators from the tag', () => {
    expect(scanTag('#design-', 0)).toEqual({ name: 'design', end: 7 });
    expect(scanTag('#design__ x', 0)).toEqual({ name: 'design', end: 7 });
  });

  it('C++ is the tag "C" — the "++" is text', () => {
    expect(scanTag('#C++', 0)).toEqual({ name: 'C', end: 2 });
  });

  it('rejects an all-numeric run (issue references stay text)', () => {
    expect(scanTag('#123', 0)).toBeNull();
    expect(scanTag('#1984', 0)).toBeNull();
    expect(scanTag('#2024-01', 0)).toBeNull();
  });

  it('rejects a run with no letter at all', () => {
    expect(scanTag('#-', 0)).toBeNull();
    expect(scanTag('#_', 0)).toBeNull();
    expect(scanTag('#---', 0)).toBeNull();
    expect(scanTag('#🎨', 0)).toBeNull();
  });

  it('rejects the whole token for a nested-looking #foo/bar instead of truncating to #foo', () => {
    expect(scanTag('#foo/bar', 0)).toBeNull();
    expect(scanTag('#a/b/c', 0)).toBeNull();
    expect(scanTag('#foo/ bar', 0)).toEqual({ name: 'foo', end: 4 });
    expect(scanTag('#foo/', 0)).toEqual({ name: 'foo', end: 4 });
  });

  it('rejects (never truncates) a run longer than the maximum length', () => {
    expect(scanTag(`#${'a'.repeat(MAX_TAG_LENGTH)}`, 0)).not.toBeNull();
    expect(scanTag(`#${'a'.repeat(MAX_TAG_LENGTH + 1)}`, 0)).toBeNull();
  });

  it('scans from an offset', () => {
    expect(scanTag('foo #tag', 4)).toEqual({ name: 'tag', end: 8 });
  });

  it('returns null when there is no # at the offset or nothing follows it', () => {
    expect(scanTag('tag', 0)).toBeNull();
    expect(scanTag('#', 0)).toBeNull();
    expect(scanTag('# tag', 0)).toBeNull();
    expect(scanTag('#!', 0)).toBeNull();
  });
});

describe('isValidTagPrecedingContext', () => {
  it('accepts start of content and whitespace only', () => {
    expect(isValidTagPrecedingContext(undefined)).toBe(true);
    expect(isValidTagPrecedingContext(' ')).toBe(true);
    expect(isValidTagPrecedingContext('\n')).toBe(true);
    expect(isValidTagPrecedingContext('\t')).toBe(true);
    expect(isValidTagPrecedingContext('o')).toBe(false);
    expect(isValidTagPrecedingContext(']')).toBe(false);
  });
});

describe('isTagQueryText', () => {
  it('matches the tag character class, including Unicode', () => {
    expect(isTagQueryText('')).toBe(true);
    expect(isTagQueryText('café-x_1')).toBe(true);
    expect(isTagQueryText('a b')).toBe(false);
    expect(isTagQueryText('a.b')).toBe(false);
  });
});
