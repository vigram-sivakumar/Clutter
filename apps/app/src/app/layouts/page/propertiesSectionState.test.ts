import { describe, expect, it } from 'vitest';

import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';

import { removePropertiesListing } from '@core/vault/ingest/frontmatter/propertyVisibility';

import { derivePropertiesSectionState } from './propertiesSectionState';

const lines = (yaml: string): readonly string[] =>
  new FrontmatterParser().parse(`---\nid: a\n${yaml}\n---\nbody`).frontmatter.unownedLines ?? [];

const state = (yaml: string, options: { isArchived?: boolean; hasDraft?: boolean; isStarting?: boolean } = {}) =>
  derivePropertiesSectionState({ lines: lines(yaml), isArchived: false, hasDraft: false, ...options });

describe('derivePropertiesSectionState — the lifecycle', () => {
  it('State 1: nothing added — the title says "Add a property", and there is no section or row', () => {
    for (const yaml of ['priority: high', 'properties:\n  visible:', 'properties:\n  show: false']) {
      expect(state(yaml)).toEqual({ isDisplayed: false, showsAddRow: false, control: 'add' });
    }
  });

  it('State 1, first property being named: the section shows its draft, without a "+ Add a property" row; the title offers nothing', () => {
    expect(state('priority: high', { hasDraft: true })).toEqual({
      isDisplayed: true,
      showsAddRow: false,
      control: null,
    });
  });

  it('State 1, just started from the title: the (empty) section shows with its "+ Add a property" row, which hosts the type menu; the title offers nothing', () => {
    expect(state('priority: high', { isStarting: true })).toEqual({
      isDisplayed: true,
      showsAddRow: true,
      control: null,
    });
  });

  it('State 2: a property exists and the section is shown — the section ends with "+ Add a property"; the title offers no Show/Hide item', () => {
    expect(state('properties:\n  show: true\n  visible:\n    - tags')).toEqual({
      isDisplayed: true,
      showsAddRow: true,
      control: null,
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

  it('"Add a property" exists only before the first property: with any listed property the title is only ever Show properties, or nothing', () => {
    for (const show of ['', '  show: true\n', '  show: false\n']) {
      const result = state(`properties:\n${show}  visible:\n    - tags`);
      expect(result.control).not.toBe('add');
      expect(['show', null]).toContain(result.control);
    }
  });

  it('a shown section whose list is empty keeps its "+ Add a property" row, so a first property can be added again', () => {
    expect(state('properties:\n  show: true')).toEqual({ isDisplayed: true, showsAddRow: true, control: null });
  });

  it('hiding changes only `show`: the same listed properties give State 2 (no title item) and State 3 (Show properties)', () => {
    const shown = state('properties:\n  show: true\n  visible:\n    - tags');
    const hidden = state('properties:\n  show: false\n  visible:\n    - tags');

    expect([shown.control, hidden.control]).toEqual([null, 'show']);
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

describe('after the last listed property is removed', () => {
  it('behaves exactly like a note that never had Properties: no section, no add row, and the title says "Add a property"', () => {
    const afterRemoval = removePropertiesListing(lines('properties:\n  show: true\n  visible:\n    - tags'));

    expect(derivePropertiesSectionState({ lines: afterRemoval, isArchived: false, hasDraft: false })).toEqual(
      derivePropertiesSectionState({ lines: lines('priority: high'), isArchived: false, hasDraft: false })
    );
    expect(derivePropertiesSectionState({ lines: afterRemoval, isArchived: false, hasDraft: false })).toEqual({
      isDisplayed: false,
      showsAddRow: false,
      control: 'add',
    });
  });
});
