import { describe, expect, it } from 'vitest';

import { lastUnescapedSlashOffset, scanWikiLink } from './wikiLinkScanner';

/**
 * Pure scanner tests — no CM6/Lezer runtime involved. Every case is a
 * worked example from the WikiLink grammar research
 * (docs/editor-research/clutter-editor-wikilink-grammar.md and its
 * corrections addendum), traced by hand against the algorithm before this
 * file was written, not reverse-engineered from the implementation.
 */

describe('scanWikiLink — successful matches', () => {
  it('parses a bare path with no alias', () => {
    const text = '[[Projects/Project A]]';
    const match = scanWikiLink(text, 0);
    expect(match).toEqual({ path: 'Projects/Project A', alias: null, end: text.length });
  });

  it('parses a path with a local alias', () => {
    const text = '[[Projects/Project A|2026 project]]';
    const match = scanWikiLink(text, 0);
    expect(match).toEqual({
      path: 'Projects/Project A',
      alias: '2026 project',
      end: text.length,
    });
  });

  it('an escaped pipe is not a separator — the whole thing is one path segment', () => {
    const text = '[[Notes \\| Ideas]]';
    const match = scanWikiLink(text, 0);
    expect(match).toEqual({ path: 'Notes | Ideas', alias: null, end: text.length });
  });

  it('an unescaped pipe is the separator, even surrounded by spaces — raw, untrimmed text is preserved', () => {
    // The scanner is a faithful, lenient reader: it does not trim
    // incidental whitespace — that's the writer's job (wikiLinkSerialize.ts),
    // per "lenient reader, strict writer". A trailing space before the
    // separator, and a leading space after it, are preserved exactly.
    const text = '[[Notes | Ideas]]';
    const match = scanWikiLink(text, 0);
    expect(match).toEqual({ path: 'Notes ', alias: ' Ideas', end: text.length });
  });

  it('an escaped pipe inside the alias resolves to a literal pipe in the alias value', () => {
    const text = '[[Notes | Ideas \\| 2026]]';
    const match = scanWikiLink(text, 0);
    expect(match).toEqual({ path: 'Notes ', alias: ' Ideas | 2026', end: text.length });
  });

  it('only the first unescaped pipe is a separator — [[A|B|C]] means path=A, alias=B|C', () => {
    const text = '[[A|B|C]]';
    const match = scanWikiLink(text, 0);
    expect(match).toEqual({ path: 'A', alias: 'B|C', end: text.length });
  });

  it('[[foo||bar]] resolves via the same rule with no special-casing: path=foo, alias=|bar', () => {
    const text = '[[foo||bar]]';
    const match = scanWikiLink(text, 0);
    expect(match).toEqual({ path: 'foo', alias: '|bar', end: text.length });
  });

  it('a doubled-escaped bracket pair produces a literal ]] inside the path', () => {
    const text = '[[A\\]\\]B]]';
    const match = scanWikiLink(text, 0);
    expect(match).toEqual({ path: 'A]]B', alias: null, end: text.length });
  });

  it('an escape of a non-punctuation character is not recognized — both characters stay literal', () => {
    const text = '[[foo\\q]]';
    const match = scanWikiLink(text, 0);
    expect(match).toEqual({ path: 'foo\\q', alias: null, end: text.length });
  });

  it('a literal backslash is written doubled', () => {
    const text = '[[A\\\\B]]';
    const match = scanWikiLink(text, 0);
    expect(match).toEqual({ path: 'A\\B', alias: null, end: text.length });
  });
});

describe('scanWikiLink — continuation lookahead defers to Link/Image', () => {
  it('[[foo]](url) is not claimed — a valid link continuation follows the close', () => {
    expect(scanWikiLink('[[foo]](url)', 0)).toBeNull();
  });

  it('[[foo]][ref] is not claimed — a valid reference continuation follows the close', () => {
    expect(scanWikiLink('[[foo]][ref]', 0)).toBeNull();
  });

  it('a plain trailing character with no continuation is claimed normally', () => {
    const text = '[[foo]] bar';
    const match = scanWikiLink(text, 0);
    expect(match).toEqual({ path: 'foo', alias: null, end: 7 });
  });
});

describe('scanWikiLink — all-or-nothing: malformed input never produces a partial result', () => {
  it.each([
    ['[[', 'nothing after the opening'],
    ['[[foo', 'no closer at all'],
    ['[[foo|', 'separator with nothing after it'],
    ['[[foo|bar', 'alias content but no closer'],
  ])('%s (%s) returns null, not a partial match', (text) => {
    expect(scanWikiLink(text, 0)).toBeNull();
  });

  it('[[foo\\]] is one character short of a valid close and fails entirely', () => {
    // \] escapes to a literal ']', leaving a single unpaired ']' — not a
    // valid two-character closer. Traced explicitly in the grammar
    // research as the case most likely to look right but not be.
    expect(scanWikiLink('[[foo\\]]', 0)).toBeNull();
  });

  it('[[foo\\]]] (one more bracket) closes correctly with the escaped bracket as literal path content', () => {
    const text = '[[foo\\]]]';
    const match = scanWikiLink(text, 0);
    expect(match).toEqual({ path: 'foo]', alias: null, end: text.length });
  });
});

describe('scanWikiLink — rejects non-WikiLink input outright', () => {
  it('returns null for a single bracket', () => {
    expect(scanWikiLink('[text](url)', 0)).toBeNull();
  });

  it('returns null when startIndex does not point at [[', () => {
    expect(scanWikiLink('x[[foo]]', 0)).toBeNull();
  });
});

describe('lastUnescapedSlashOffset', () => {
  it('returns null for a reference with no folder component', () => {
    expect(lastUnescapedSlashOffset('Note')).toBeNull();
  });

  it('returns null for an empty reference', () => {
    expect(lastUnescapedSlashOffset('')).toBeNull();
  });

  it('finds the single slash in a one-level path', () => {
    expect(lastUnescapedSlashOffset('Projects/Note')).toBe(8);
  });

  it('finds the LAST slash in a nested path, not the first', () => {
    const text = 'Projects/Project A/Note';
    expect(lastUnescapedSlashOffset(text)).toBe(text.lastIndexOf('/'));
  });

  it('does not count an escaped slash as a separator', () => {
    // "A\/B" — one literal "A/B" filename, no real folder component.
    expect(lastUnescapedSlashOffset('A\\/B')).toBeNull();
  });

  it('finds a real slash that follows an escaped one', () => {
    // "A\/B/Note" — literal "A/B" is the folder, "Note" the filename; the
    // real (unescaped) separator is the second "/".
    const text = 'A\\/B/Note';
    expect(lastUnescapedSlashOffset(text)).toBe(text.lastIndexOf('/'));
  });

  it('does not throw on a trailing backslash with nothing after it', () => {
    expect(lastUnescapedSlashOffset('Note\\')).toBeNull();
  });
});
