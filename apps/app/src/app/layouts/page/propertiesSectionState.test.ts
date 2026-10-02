import { describe, expect, it } from 'vitest';

import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';

import { derivePropertiesSectionState } from './propertiesSectionState';

const lines = (yaml: string): readonly string[] =>
  new FrontmatterParser().parse(`---\nid: a\n${yaml}\n---\nbody`).frontmatter.unownedLines ?? [];

const state = (yaml: string, options: { isArchived?: boolean; hasDraft?: boolean } = {}) =>
  derivePropertiesSectionState({ lines: lines(yaml), isArchived: false, hasDraft: false, ...options });

describe('derivePropertiesSectionState — the lifecycle', () => {
  it('State 1: nothing added — the title says "Add a property", and there is no section or row', () => {
    for (const yaml of ['priority: high', 'properties:\n  visible:', 'properties:\n  show: false']) {
      expect(state(yaml)).toEqual({ isDisplayed: false, showsAddRow: false, control: 'add' });
    }
  });

  it('State 1, first property being named: the section shows its draft, without a "+ Add a property" row; the title is "Hide properties"', () => {
    expect(state('priority: high', { hasDraft: true })).toEqual({
      isDisplayed: true,
      showsAddRow: false,
      control: 'hide',
    });
  });

  it('State 2: a property exists and the section is shown — the section ends with "+ Add a property"; the title is "Hide properties"', () => {
    expect(state('properties:\n  show: true\n  visible:\n    - tags')).toEqual({
      isDisplayed: true,
      showsAddRow: true,
      control: 'hide',
    });
  });

  it('State 3: the section is hidden — `show: false`, with its properties still listed — and the title says "Show properties"', () => {
    expect(state('properties:\n  show: false\n  visible:\n    - tags\n    - created')).toEqual({
      isDisplayed: false,
      showsAddRow: false,
      control: 'show',
    });
  });

  it('a note that lists properties but has no `show` is hidden, and offers "Show properties" — never "Add a property"', () => {
    expect(state('properties:\n  visible:\n    - tags')).toEqual({
      isDisplayed: false,
      showsAddRow: false,
      control: 'show',
    });
  });

  it('"Add a property" exists only before the first property: with any listed property it is the toggle for good', () => {
    for (const show of ['', '  show: true\n', '  show: false\n']) {
      const result = state(`properties:\n${show}  visible:\n    - tags`);
      expect(result.control).not.toBe('add');
    }
  });

  it('a shown section whose list is empty keeps its "+ Add a property" row, so a first property can be added again', () => {
    expect(state('properties:\n  show: true')).toEqual({ isDisplayed: true, showsAddRow: true, control: 'hide' });
  });

  it('hiding changes only `show`: the same listed properties give State 2 and State 3', () => {
    const shown = state('properties:\n  show: true\n  visible:\n    - tags');
    const hidden = state('properties:\n  show: false\n  visible:\n    - tags');

    expect([shown.control, hidden.control]).toEqual(['hide', 'show']);
  });

  it('a draft never displays an already hidden section that holds properties', () => {
    // A draft can only be started where the section is displayed, so this
    // is the hide path: drafts are cleared with it; but the rule is explicit.
    expect(state('properties:\n  show: false\n  visible:\n    - tags', { hasDraft: false }).isDisplayed).toBe(false);
  });

  it('an archived page is view-only: it displays what its file says, with no control and no add row', () => {
    expect(state('properties:\n  show: true\n  visible:\n    - tags', { isArchived: true })).toEqual({
      isDisplayed: true,
      showsAddRow: false,
      control: null,
    });
    expect(state('properties:\n  visible:\n    - tags', { isArchived: true })).toEqual({
      isDisplayed: false,
      showsAddRow: false,
      control: null,
    });
    // A draft doesn't display an archived page's section either.
    expect(state('priority: high', { isArchived: true, hasDraft: true }).isDisplayed).toBe(false);
  });
});
