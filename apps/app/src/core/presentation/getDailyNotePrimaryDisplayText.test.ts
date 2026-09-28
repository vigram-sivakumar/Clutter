import { describe, expect, it } from 'vitest';
import { getDailyNotePrimaryDisplayText } from './getDailyNotePrimaryDisplayText';

describe('getDailyNotePrimaryDisplayText', () => {
  it('returns null for empty content', () => {
    expect(getDailyNotePrimaryDisplayText('')).toBeNull();
  });

  it('returns null for whitespace-only content', () => {
    expect(getDailyNotePrimaryDisplayText('   \n\n\t\n   ')).toBeNull();
  });

  it('returns the first non-blank line of plain text', () => {
    expect(getDailyNotePrimaryDisplayText('\n\nHello world\nSecond line')).toBe(
      'Hello world'
    );
  });

  it('strips heading syntax', () => {
    expect(getDailyNotePrimaryDisplayText('## Groceries\n- [ ] Milk')).toBe(
      'Groceries'
    );
  });

  it('skips an empty heading and falls through to the next line', () => {
    expect(getDailyNotePrimaryDisplayText('# \nReal content')).toBe('Real content');
  });

  it('strips task checkbox syntax, both unchecked and checked', () => {
    expect(getDailyNotePrimaryDisplayText('- [ ] Buy milk')).toBe('Buy milk');
    expect(getDailyNotePrimaryDisplayText('- [x] Buy milk')).toBe('Buy milk');
    expect(getDailyNotePrimaryDisplayText('- [X] Buy milk')).toBe('Buy milk');
  });

  it('strips plain list markers', () => {
    expect(getDailyNotePrimaryDisplayText('- First item')).toBe('First item');
    expect(getDailyNotePrimaryDisplayText('* First item')).toBe('First item');
    expect(getDailyNotePrimaryDisplayText('+ First item')).toBe('First item');
  });

  it('strips blockquote syntax', () => {
    expect(getDailyNotePrimaryDisplayText('> A quote')).toBe('A quote');
  });

  it('skips multiple blank lines before finding real content', () => {
    expect(getDailyNotePrimaryDisplayText('\n   \n\nReal content\n')).toBe(
      'Real content'
    );
  });

  it('skips a leading table, falling through to the following paragraph', () => {
    expect(
      getDailyNotePrimaryDisplayText('| A | B |\n|---|---|\n| 1 | 2 |\n\nWorked on the sidebar today.')
    ).toBe('Worked on the sidebar today.');
  });

  it('returns null when the document is only a table', () => {
    expect(getDailyNotePrimaryDisplayText('| A | B |\n|---|---|\n| 1 | 2 |')).toBeNull();
  });

  it('skips a leading fenced code block, falling through to the following paragraph', () => {
    expect(
      getDailyNotePrimaryDisplayText('```ts\nconst x = 1\n```\n\nWorked on the sidebar today.')
    ).toBe('Worked on the sidebar today.');
  });

  it('returns null when the document is only a fenced code block', () => {
    expect(getDailyNotePrimaryDisplayText('```ts\nconst x = 1\n```')).toBeNull();
  });

  it('strips an ordered list marker, using the first item', () => {
    expect(getDailyNotePrimaryDisplayText('1. Finished sidebar\n2. Fixed table')).toBe('Finished sidebar');
  });

  it('takes a heading over a later table, matching the shared block-selection policy', () => {
    expect(getDailyNotePrimaryDisplayText('# Today')).toBe('Today');
  });

  it('skips an unlabeled thematic rule, falling through to real content', () => {
    expect(getDailyNotePrimaryDisplayText('---\n\nReal content')).toBe('Real content');
  });

  it('surfaces a labeled thematic rule\'s own label as meaningful content', () => {
    expect(getDailyNotePrimaryDisplayText('--- Chapter 1 ---')).toBe('Chapter 1');
  });

  it('leaves inline Markdown syntax in the returned string for the second compact-render pass to resolve', () => {
    expect(getDailyNotePrimaryDisplayText('**Bold** start to the day')).toBe('**Bold** start to the day');
  });
});
