import { describe, expect, it } from 'vitest';

import type { PageReferences } from './getPageReferences';
import { countPageReferences, isReferencesDisplayed } from './referencesDisplay';

describe('isReferencesDisplayed', () => {
  const auto = (count: number) => ({ enabled: true, count });
  const manual = (count: number) => ({ enabled: false, count });

  it('is hidden with no saved choice when automatic visibility is not given or is off (ADR-053)', () => {
    expect(isReferencesDisplayed(undefined)).toBe(false);
    expect(isReferencesDisplayed(undefined, manual(3))).toBe(false);
  });

  it('shows itself with no saved choice when automatic visibility is on and there is at least one reference', () => {
    expect(isReferencesDisplayed(undefined, auto(1))).toBe(true);
    expect(isReferencesDisplayed(undefined, auto(7))).toBe(true);
  });

  it('does not show itself automatically when there are no references', () => {
    expect(isReferencesDisplayed(undefined, auto(0))).toBe(false);
  });

  it.each([auto(0), auto(5), manual(0), manual(5)])('an explicit Hide always stays hidden (%j)', (mode) => {
    expect(isReferencesDisplayed(true, mode)).toBe(false);
  });

  it.each([auto(0), auto(5), manual(0), manual(5)])('an explicit Show always displays the section, even empty (%j)', (mode) => {
    expect(isReferencesDisplayed(false, mode)).toBe(true);
  });
});

describe('countPageReferences', () => {
  it('counts tasks, notes and daily notes together', () => {
    const lists = { tasks: [1, 2], notes: [3], dailyNotes: [4, 5, 6] } as unknown as PageReferences;
    expect(countPageReferences(lists)).toBe(6);
  });
});
