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
});
