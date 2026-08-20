import { describe, expect, it } from 'vitest';

import { getDateSuggestions } from './dateSuggestion';

// Fixed reference date so relative labels resolve deterministically:
// Thursday, 2026-08-20.
const REFERENCE = new Date(2026, 7, 20);

describe('getDateSuggestions', () => {
  it('@ (empty query) offers only Today — always at most one result', () => {
    const suggestions = getDateSuggestions('', REFERENCE);
    expect(suggestions.map((s) => s.label)).toEqual(['Today']);
    expect(suggestions[0]!.isoDate).toBe('2026-08-20');
  });

  it('@t resolves to Today, not Today + Tomorrow — first-match-wins on overlapping prefixes', () => {
    const labels = getDateSuggestions('t', REFERENCE).map((s) => s.label);
    expect(labels).toEqual(['Today']);
  });

  it('@to resolves to Today, not Today + Tomorrow', () => {
    const labels = getDateSuggestions('to', REFERENCE).map((s) => s.label);
    expect(labels).toEqual(['Today']);
  });

  it('@Tom matches only Tomorrow', () => {
    const suggestions = getDateSuggestions('Tom', REFERENCE);
    expect(suggestions.map((s) => s.label)).toEqual(['Tomorrow']);
    expect(suggestions[0]!.isoDate).toBe('2026-08-21');
  });

  it('@Yesterday matches only Yesterday, resolving to the day before the reference date', () => {
    const suggestions = getDateSuggestions('Yesterday', REFERENCE);
    expect(suggestions.map((s) => s.label)).toEqual(['Yesterday']);
    expect(suggestions[0]!.isoDate).toBe('2026-08-19');
  });

  it('is case-insensitive', () => {
    expect(getDateSuggestions('tom', REFERENCE).map((s) => s.label)).toEqual(['Tomorrow']);
  });

  it('display label and canonical isoDate are distinct values', () => {
    const suggestions = getDateSuggestions('Today', REFERENCE);
    expect(suggestions[0]!.label).toBe('Today');
    expect(suggestions[0]!.isoDate).toBe('2026-08-20');
    expect(suggestions[0]!.label).not.toBe(suggestions[0]!.isoDate);
  });

  it('@2026- (partial shape) offers nothing — no single date to complete to', () => {
    expect(getDateSuggestions('2026-', REFERENCE)).toEqual([]);
  });

  it('@2026-08 (partial shape) offers nothing', () => {
    expect(getDateSuggestions('2026-08', REFERENCE)).toEqual([]);
  });

  it('a complete, valid absolute date is echoed back as its own suggestion', () => {
    const suggestions = getDateSuggestions('2026-09-01', REFERENCE);
    expect(suggestions).toEqual([{ label: '2026-09-01', isoDate: '2026-09-01' }]);
  });

  it('a complete but calendar-invalid absolute date offers nothing', () => {
    expect(getDateSuggestions('2026-13-45', REFERENCE)).toEqual([]);
  });

  it('an unrelated query offers nothing', () => {
    expect(getDateSuggestions('xyz', REFERENCE)).toEqual([]);
  });

  it('never uses UTC-shifted calculations — relative dates are computed against local wall-clock "now"', () => {
    // A reference date constructed via new Date(y, m, d) is already local
    // by construction (JS Date's numeric-component constructor never
    // touches UTC) — this test locks in that relativeISODate's own
    // internal math (setDate/setHours) never introduces a UTC conversion
    // along the way, by asserting the exact expected local calendar day.
    const suggestions = getDateSuggestions('', REFERENCE);
    expect(suggestions.find((s) => s.label === 'Today')?.isoDate).toBe('2026-08-20');
  });
});
