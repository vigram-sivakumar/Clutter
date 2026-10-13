import { describe, expect, it } from 'vitest';

import type { PageReferences } from './getPageReferences';
import { countPageReferences, isReferencesDisplayed } from './referencesDisplay';

describe('isReferencesDisplayed', () => {
  it('is hidden by default, with no saved choice', () => {
    expect(isReferencesDisplayed(undefined)).toBe(false);
  });

  it('an explicit Hide stays hidden', () => {
    expect(isReferencesDisplayed(true)).toBe(false);
  });

  it('an explicit Show displays the section', () => {
    expect(isReferencesDisplayed(false)).toBe(true);
  });
});

describe('countPageReferences', () => {
  it('counts tasks, notes and daily notes together', () => {
    const lists = { tasks: [1, 2], notes: [3], dailyNotes: [4, 5, 6] } as unknown as PageReferences;
    expect(countPageReferences(lists)).toBe(6);
  });
});
