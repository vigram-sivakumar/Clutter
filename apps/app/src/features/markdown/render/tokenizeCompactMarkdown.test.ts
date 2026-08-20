import { describe, expect, it } from 'vitest';

import { tokenizeCompactMarkdown } from './tokenizeCompactMarkdown';

describe('tokenizeCompactMarkdown', () => {
  it('returns a single text span for plain text', () => {
    expect(tokenizeCompactMarkdown('Ship the release notes')).toEqual([
      { kind: 'text', value: 'Ship the release notes' },
    ]);
  });

  it('returns an empty array for empty text', () => {
    expect(tokenizeCompactMarkdown('')).toEqual([]);
  });

  it('tokenizes bold text, stripping the ** markers', () => {
    expect(tokenizeCompactMarkdown('**Ship it**')).toEqual([{ kind: 'bold', value: 'Ship it' }]);
  });

  it('tokenizes italic text, stripping the * markers', () => {
    expect(tokenizeCompactMarkdown('*Ship it*')).toEqual([{ kind: 'italic', value: 'Ship it' }]);
  });

  it('tokenizes strikethrough text, stripping the ~~ markers', () => {
    expect(tokenizeCompactMarkdown('~~Ship it~~')).toEqual([{ kind: 'strikethrough', value: 'Ship it' }]);
  });

  it('tokenizes inline code, stripping the backtick markers', () => {
    expect(tokenizeCompactMarkdown('`npm run build`')).toEqual([{ kind: 'code', value: 'npm run build' }]);
  });

  it('tokenizes a WikiLink with no alias', () => {
    expect(tokenizeCompactMarkdown('[[Project Alpha]]')).toEqual([
      { kind: 'wikilink', path: 'Project Alpha', alias: null },
    ]);
  });

  it('tokenizes a WikiLink with an alias', () => {
    expect(tokenizeCompactMarkdown('[[Projects/Alpha|Alpha]]')).toEqual([
      { kind: 'wikilink', path: 'Projects/Alpha', alias: 'Alpha' },
    ]);
  });

  it('tokenizes a tag', () => {
    expect(tokenizeCompactMarkdown('#urgent')).toEqual([{ kind: 'tag', name: 'urgent' }]);
  });

  it('tokenizes a bare date', () => {
    expect(tokenizeCompactMarkdown('@2026-08-22')).toEqual([{ kind: 'date', isoDate: '2026-08-22' }]);
  });

  it('does not tokenize a # immediately following non-whitespace as a tag', () => {
    expect(tokenizeCompactMarkdown('foo#tag')).toEqual([{ kind: 'text', value: 'foo#tag' }]);
  });

  it('tokenizes mixed content in document order with plain text gaps preserved', () => {
    expect(tokenizeCompactMarkdown('Ship **[[Project Alpha]]** by @2026-08-22 #urgent')).toEqual([
      { kind: 'text', value: 'Ship ' },
      { kind: 'bold', value: '[[Project Alpha]]' },
      { kind: 'text', value: ' by ' },
      { kind: 'date', isoDate: '2026-08-22' },
      { kind: 'text', value: ' ' },
      { kind: 'tag', name: 'urgent' },
    ]);
  });

  it('tokenizes several independent inline constructs sequentially', () => {
    expect(tokenizeCompactMarkdown('**bold** and *italic* and `code` and ~~gone~~')).toEqual([
      { kind: 'bold', value: 'bold' },
      { kind: 'text', value: ' and ' },
      { kind: 'italic', value: 'italic' },
      { kind: 'text', value: ' and ' },
      { kind: 'code', value: 'code' },
      { kind: 'text', value: ' and ' },
      { kind: 'strikethrough', value: 'gone' },
    ]);
  });

  it('flattens nested emphasis (***bold italic***) to a single outer span', () => {
    const spans = tokenizeCompactMarkdown('***bold italic***');

    expect(spans).toHaveLength(1);
    const [span] = spans;
    expect(span!.kind === 'bold' || span!.kind === 'italic').toBe(true);
    // The nested construct's own markers are preserved verbatim inside the
    // outer span's raw value rather than being separately recognized —
    // exactly one flat style per span is the documented v1 scope.
    expect((span as { value: string }).value).toContain('bold italic');
    expect((span as { value: string }).value).toMatch(/^\*.*\*$/);
  });

  it('flattens a WikiLink nested inside bold to raw text within the bold span', () => {
    expect(tokenizeCompactMarkdown('**[[Note]]**')).toEqual([{ kind: 'bold', value: '[[Note]]' }]);
  });
});
