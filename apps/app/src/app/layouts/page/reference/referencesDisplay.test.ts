import { describe, expect, it } from 'vitest';

import type { PageReferences } from './getPageReferences';
import { countPageReferences, isReferencesDisplayed } from './referencesDisplay';

describe('isReferencesDisplayed', () => {
  it('automatic (no saved choice): shown only when there is something to list', () => {
    expect(isReferencesDisplayed(undefined, true)).toBe(true);
    expect(isReferencesDisplayed(undefined, false)).toBe(false);
  });

  it('an explicit Hide hides even a section with references', () => {
    expect(isReferencesDisplayed(true, true)).toBe(false);
    expect(isReferencesDisplayed(true, false)).toBe(false);
  });

  it('an explicit Show keeps the section visible even when empty', () => {
    expect(isReferencesDisplayed(false, true)).toBe(true);
    expect(isReferencesDisplayed(false, false)).toBe(true);
  });
});

describe('countPageReferences', () => {
  it('counts tasks, notes and daily notes together', () => {
    const lists = { tasks: [1, 2], notes: [3], dailyNotes: [4, 5, 6] } as unknown as PageReferences;
    expect(countPageReferences(lists)).toBe(6);
  });
});
