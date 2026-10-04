import { describe, expect, it } from 'vitest';

import { matchesSearchText } from './matchesSearchText';

const TEXT = '2020-08-24 Monday, 24 August 2020 24 Aug 2020';

describe('matchesSearchText', () => {
  it('matches a query the text contains', () => {
    expect(matchesSearchText(TEXT, 'aug')).toBe(true);
    expect(matchesSearchText(TEXT, '2020-08-24')).toBe(true);
    expect(matchesSearchText(TEXT, 'monday')).toBe(true);
  });

  it('matches several words in any order — "aug 24" finds "24 August"', () => {
    expect(matchesSearchText(TEXT, 'aug 24')).toBe(true);
    expect(matchesSearchText(TEXT, 'august 24')).toBe(true);
  });

  it('ignores punctuation in the query — "aug 24, 2020"', () => {
    expect(matchesSearchText(TEXT, 'aug 24, 2020')).toBe(true);
  });

  it('needs every word to begin a word of the text', () => {
    expect(matchesSearchText(TEXT, 'aug 25')).toBe(false);
    expect(matchesSearchText(TEXT, 'sep 24')).toBe(false);
  });

  it('does not match a word inside another — "24" is not the 24 of 2024', () => {
    expect(matchesSearchText('3 August 2024', 'aug 24')).toBe(false);
  });

  it('does not match a single word that only occurs inside others', () => {
    expect(matchesSearchText('Monday', 'day')).toBe(true); // contained: the plain rule
    expect(matchesSearchText('Monday', 'zzz')).toBe(false);
  });
});
