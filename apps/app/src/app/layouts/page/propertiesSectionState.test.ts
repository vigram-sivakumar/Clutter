import { describe, expect, it } from 'vitest';

import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import { deleteAllPropertiesLines, removeSystemPropertyLines } from '@core/vault/ingest/frontmatter/propertyLines';

import { derivePropertiesSectionState } from './propertiesSectionState';

const lines = (yaml: string): readonly string[] =>
  new FrontmatterParser().parse(`---\nid: a\n${yaml}\n---\nbody`).frontmatter.unownedLines ?? [];

const state = (
  yaml: string,
  options: { isArchived?: boolean; hasDraft?: boolean; isStarting?: boolean } = {}
) => derivePropertiesSectionState({ lines: lines(yaml), isArchived: false, hasDraft: false, ...options });

const DEFAULT = { isDisplayed: false, showsAddRow: false, hasProperties: false, control: 'add' } as const;

describe('derivePropertiesSectionState — the zero-property default', () => {
  it('nothing to show: no section, no add button, and the title says "Add a property"', () => {
    for (const yaml of ['', 'description: hi', 'properties:\n  visible:', 'properties:\n  visible: []']) {
      expect(state(yaml)).toEqual(DEFAULT);
    }
  });

  it('a note with a leftover `show: false` and nothing to show is still the default', () => {
    expect(state('properties:\n  show: false')).toEqual(DEFAULT);
  });

  it('a legacy `show: true` with nothing listed does not display an empty section or an add button', () => {
    expect(state('properties:\n  show: true')).toEqual(DEFAULT);
    expect(state('properties:\n  show: true\n  visible: []')).toEqual(DEFAULT);
  });

  it('a listed key that is not a system key shows nothing', () => {
    expect(state('properties:\n  visible:\n    - Due date\n    - lastOpened')).toEqual(DEFAULT);
  });
});

describe('derivePropertiesSectionState — something to show', () => {
  it('a listed system property displays the section with its add button; the title offers nothing', () => {
    expect(state('properties:\n  visible:\n    - tags')).toEqual({
      isDisplayed: true,
      showsAddRow: true,
      hasProperties: true,
      control: null,
    });
  });

  it('a custom property displays the section automatically — no listing is needed', () => {
    expect(state('priority: high')).toEqual({ isDisplayed: true, showsAddRow: true, hasProperties: true, control: null });
  });

  it('system keys are recognized in any letter case', () => {
    expect(state('properties:\n  visible:\n    - TAGS').isDisplayed).toBe(true);
  });

  it('a legacy `show: true` is the normal state, not a second one', () => {
    expect(state('properties:\n  show: true\n  visible:\n    - tags')).toEqual(
      state('properties:\n  visible:\n    - tags')
    );
  });
});

describe('derivePropertiesSectionState — an explicitly hidden section', () => {
  it('`show: false` with properties still there: no section, no add button, the title says "Show properties"', () => {
    for (const yaml of [
      'properties:\n  show: false\n  visible:\n    - tags',
      'priority: high\nproperties:\n  show: false',
    ]) {
      expect(state(yaml)).toEqual({ isDisplayed: false, showsAddRow: false, hasProperties: true, control: 'show' });
    }
  });

  it('hiding changes only `show`: the same properties give "no title item" shown and "Show properties" hidden', () => {
    const shown = state('properties:\n  visible:\n    - tags');
    const hidden = state('properties:\n  show: false\n  visible:\n    - tags');

    expect([shown.control, hidden.control]).toEqual([null, 'show']);
    expect([shown.hasProperties, hidden.hasProperties]).toEqual([true, true]);
  });
});

describe('derivePropertiesSectionState — starting and drafts (never persisted)', () => {
  it('starting from the title: the empty section shows with its add button, which hosts the picker; the title offers nothing', () => {
    expect(state('description: hi', { isStarting: true })).toEqual({
      isDisplayed: true,
      showsAddRow: true,
      hasProperties: false,
      control: null,
    });
  });

  it('the first property being named: the section shows its draft without an add button; the title offers nothing', () => {
    expect(state('description: hi', { hasDraft: true })).toEqual({
      isDisplayed: true,
      showsAddRow: false,
      hasProperties: false,
      control: null,
    });
  });
});

describe('derivePropertiesSectionState — an archived page is view-only', () => {
  it('displays what its file says, with no control and no add button', () => {
    expect(state('properties:\n  visible:\n    - tags', { isArchived: true })).toEqual({
      isDisplayed: true,
      showsAddRow: false,
      hasProperties: true,
      control: null,
    });
    expect(state('priority: high\nproperties:\n  show: false', { isArchived: true })).toEqual({
      isDisplayed: false,
      showsAddRow: false,
      hasProperties: true,
      control: null,
    });
    // A draft doesn't display an archived page's section either.
    expect(state('description: hi', { isArchived: true, hasDraft: true }).isDisplayed).toBe(false);
  });
});

describe('after the last property goes, the note behaves exactly like one that never had Properties', () => {
  it('unlisting the last system property', () => {
    const after = removeSystemPropertyLines(lines('properties:\n  show: true\n  visible:\n    - tags'), 'tags')!;

    expect(derivePropertiesSectionState({ lines: after, isArchived: false, hasDraft: false })).toEqual(DEFAULT);
  });

  it('Delete all', () => {
    const after = deleteAllPropertiesLines(lines('priority: high\nproperties:\n  show: false\n  visible:\n    - tags'))!;

    expect(derivePropertiesSectionState({ lines: after, isArchived: false, hasDraft: false })).toEqual(DEFAULT);
  });
});
