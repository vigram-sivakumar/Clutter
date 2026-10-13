import { describe, expect, it } from 'vitest';
import {
  extractHeadingOccurrences,
  findFirstHeadingOccurrence,
} from './headingSemantics';

describe('extractHeadingOccurrences', () => {
  it('extracts ordinary headings with level, plain text, and source position', () => {
    const markdown = '# Hello\n\nSome text\n\n## World';
    const occurrences = extractHeadingOccurrences(markdown);

    expect(occurrences).toEqual([
      { level: 1, text: 'Hello', from: 0 },
      { level: 2, text: 'World', from: markdown.indexOf('## World') },
    ]);
  });

  it('extracts all six ATX heading levels', () => {
    const markdown = [
      '# One',
      '## Two',
      '### Three',
      '#### Four',
      '##### Five',
      '###### Six',
    ].join('\n\n');

    const occurrences = extractHeadingOccurrences(markdown);

    expect(occurrences.map((o) => o.level)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(occurrences.map((o) => o.text)).toEqual([
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
    ]);
  });

  it('excludes heading-like lines inside fenced code blocks', () => {
    const markdown = [
      'Some text',
      '',
      '```js',
      '# Not a heading',
      'const x = 1;',
      '```',
      '',
      'More text',
    ].join('\n');

    expect(extractHeadingOccurrences(markdown)).toEqual([]);
  });

  it('excludes heading-like lines inside blockquotes — only direct Document children qualify', () => {
    const markdown = '> # Not a document heading\n> more quote text';

    expect(extractHeadingOccurrences(markdown)).toEqual([]);
  });

  it('returns duplicate headings as independent occurrences, preserving document order', () => {
    const markdown = '# Root causes\ntext\n\n## Root causes\nmore text';
    const occurrences = extractHeadingOccurrences(markdown);

    expect(occurrences).toHaveLength(2);
    expect(occurrences[0]).toMatchObject({ level: 1, text: 'Root causes' });
    expect(occurrences[1]).toMatchObject({ level: 2, text: 'Root causes' });
    expect(occurrences[0]!.from).toBeLessThan(occurrences[1]!.from);
  });

  it('extracts plain text from headings containing inline markdown', () => {
    const markdown = '# Hello **World**';
    const occurrences = extractHeadingOccurrences(markdown);

    expect(occurrences).toEqual([{ level: 1, text: 'Hello World', from: 0 }]);
  });

  it('returns an empty array for markdown with no headings', () => {
    expect(extractHeadingOccurrences('Just a paragraph, no headings here.')).toEqual([]);
  });
});

describe('findFirstHeadingOccurrence', () => {
  it('returns the first exact match in document order for duplicate headings', () => {
    const occurrences = [
      { level: 1, text: 'Root causes', from: 0 },
      { level: 2, text: 'Root causes', from: 50 },
    ];

    expect(findFirstHeadingOccurrence(occurrences, 'Root causes')).toBe(
      occurrences[0]
    );
  });

  it('matches exactly — case-sensitive, no substring/fuzzy matching', () => {
    const occurrences = [{ level: 1, text: 'Root Causes', from: 0 }];

    expect(findFirstHeadingOccurrence(occurrences, 'root causes')).toBeUndefined();
    expect(findFirstHeadingOccurrence(occurrences, 'Root Causes')).toBe(
      occurrences[0]
    );
  });

  it('returns undefined when no heading matches', () => {
    const occurrences = [{ level: 1, text: 'Hello', from: 0 }];

    expect(findFirstHeadingOccurrence(occurrences, 'Missing')).toBeUndefined();
  });
});
