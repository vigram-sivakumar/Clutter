import { describe, expect, it } from 'vitest';
import { getPrimaryDisplayText } from './getPrimaryDisplayText';

describe('getPrimaryDisplayText', () => {
  it('returns null for empty content', () => {
    expect(getPrimaryDisplayText('')).toBeNull();
  });

  it('returns null for whitespace-only content', () => {
    expect(getPrimaryDisplayText('   \n\n\t\n   ')).toBeNull();
  });

  it('returns the first non-blank line of plain text', () => {
    expect(getPrimaryDisplayText('\n\nHello world\nSecond line')).toBe(
      'Hello world'
    );
  });

  it('strips heading syntax', () => {
    expect(getPrimaryDisplayText('## Groceries\n- [ ] Milk')).toBe(
      'Groceries'
    );
  });

  it('skips an empty heading and falls through to the next line', () => {
    expect(getPrimaryDisplayText('# \nReal content')).toBe('Real content');
  });

  it('strips task checkbox syntax, both unchecked and checked', () => {
    expect(getPrimaryDisplayText('- [ ] Buy milk')).toBe('Buy milk');
    expect(getPrimaryDisplayText('- [x] Buy milk')).toBe('Buy milk');
    expect(getPrimaryDisplayText('- [X] Buy milk')).toBe('Buy milk');
  });

  it('strips plain list markers', () => {
    expect(getPrimaryDisplayText('- First item')).toBe('First item');
    expect(getPrimaryDisplayText('* First item')).toBe('First item');
    expect(getPrimaryDisplayText('+ First item')).toBe('First item');
  });

  it('strips blockquote syntax', () => {
    expect(getPrimaryDisplayText('> A quote')).toBe('A quote');
  });

  it('skips multiple blank lines before finding real content', () => {
    expect(getPrimaryDisplayText('\n   \n\nReal content\n')).toBe(
      'Real content'
    );
  });
});
