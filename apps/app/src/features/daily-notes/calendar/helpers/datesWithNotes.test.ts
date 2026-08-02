import { describe, expect, it } from 'vitest';

import { datesWithNotes } from './datesWithNotes';
import type { Page } from '@core/vault/models/Page';

function makeDailyNote(name: string): Page {
  return { name } as Page;
}

describe('datesWithNotes', () => {
  it('returns the ISO dates of the given daily notes', () => {
    const notes = [makeDailyNote('2026-07-10'), makeDailyNote('2026-07-15')];

    const result = datesWithNotes(notes);

    expect(result.has('2026-07-10')).toBe(true);
    expect(result.has('2026-07-15')).toBe(true);
    expect(result.has('2026-07-11')).toBe(false);
  });

  it('returns an empty set for no daily notes', () => {
    expect(datesWithNotes([]).size).toBe(0);
  });

  it('deduplicates repeated dates', () => {
    const notes = [makeDailyNote('2026-07-10'), makeDailyNote('2026-07-10')];

    expect(datesWithNotes(notes).size).toBe(1);
  });
});
