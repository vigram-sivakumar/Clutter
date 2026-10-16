import { describe, expect, it } from 'vitest';

import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import { deleteAllPropertiesLines, removeSystemPropertyLines } from '@core/vault/ingest/frontmatter/propertyLines';

import { derivePropertiesSectionState } from './propertiesSectionState';

const read = (yaml: string) => {
  const { frontmatter } = new FrontmatterParser().parse(`---\nid: a\n${yaml}\n---\nbody`);

  return { lines: frontmatter.unownedLines ?? [], order: frontmatter.entryOrder };
};

const state = (
  yaml: string,
  options: { isArchived?: boolean; hasDraft?: boolean; isStarting?: boolean } = {}
) => {
  const { lines, order } = read(yaml);

  return derivePropertiesSectionState({ lines, ...(order && { order }), isArchived: false, hasDraft: false, ...options });
};

const DEFAULT = { isDisplayed: false, showsAddRow: false, hasProperties: false, control: 'add' } as const;

describe('derivePropertiesSectionState — the zero-property default', () => {
  it('nothing to show: no section, no add button, and the title says "Add a property"', () => {
    for (const yaml of ['', 'description: hi', 'favorite: true\nicon: x']) {
      expect(state(yaml)).toEqual(DEFAULT);
    }
  });

  it('`showProperties: false` with nothing to show is still the default', () => {
    expect(state('showProperties: false')).toEqual(DEFAULT);
  });

  it('`showProperties` itself is never something to show', () => {
    expect(state('showProperties: true')).toEqual(DEFAULT);
  });

  it('a `properties:` block is just a custom property now, and `lastOpened` is nothing special', () => {
    expect(state('lastOpened: 2026-01-01').hasProperties).toBe(true);
    expect(state('properties:\n  visible:\n    - tags').hasProperties).toBe(true);
  });
});

describe('derivePropertiesSectionState — the template marker', () => {
  it('a note whose only custom property is `kind: template` shows nothing, like a note with no properties', () => {
    expect(state('kind: template')).toEqual(DEFAULT);
  });

  it("a user's own `kind` still counts as a custom property to show", () => {
    expect(state('kind: book').hasProperties).toBe(true);
  });
});

describe('derivePropertiesSectionState — something to show', () => {
  it('a declared system property displays the section with its add button; the title offers nothing', () => {
    for (const yaml of ['tags: []', 'created: true', 'modified: true', 'aliases:\n  - a']) {
      expect(state(yaml)).toEqual({ isDisplayed: true, showsAddRow: true, hasProperties: true, control: null });
    }
  });

  it('a custom property displays the section automatically — its key is its declaration', () => {
    expect(state('priority: high')).toEqual({ isDisplayed: true, showsAddRow: true, hasProperties: true, control: null });
  });

  it('system keys are recognized in any letter case', () => {
    expect(state('TAGS: []').isDisplayed).toBe(true);
  });

  it('`showProperties: true` is the normal state, not a second one', () => {
    expect(state('showProperties: true\ntags: []')).toEqual(state('tags: []'));
  });
});

describe('derivePropertiesSectionState — an explicitly hidden section', () => {
  it('`showProperties: false` with properties still there: no section, no add button, the title says "Show properties"', () => {
    for (const yaml of ['showProperties: false\ntags: []', 'priority: high\nshowProperties: false']) {
      expect(state(yaml)).toEqual({ isDisplayed: false, showsAddRow: false, hasProperties: true, control: 'show' });
    }
  });

  it('hiding changes only `showProperties`: the same properties give "no title item" shown and "Show properties" hidden', () => {
    const shown = state('tags: []');
    const hidden = state('showProperties: false\ntags: []');

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
    expect(state('tags: []', { isArchived: true })).toEqual({
      isDisplayed: true,
      showsAddRow: false,
      hasProperties: true,
      control: null,
    });
    expect(state('priority: high\nshowProperties: false', { isArchived: true })).toEqual({
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
  const after = (next: { lines: readonly string[]; order?: readonly string[] }) =>
    derivePropertiesSectionState({ lines: next.lines, ...(next.order && { order: next.order }), isArchived: false, hasDraft: false });

  it('removing the last system property', () => {
    expect(after(removeSystemPropertyLines(read('tags: []'), 'tags')!)).toEqual(DEFAULT);
  });

  it('Delete all', () => {
    expect(after(deleteAllPropertiesLines(read('priority: high\ncreated: true\nshowProperties: false\ntags: []'))!)).toEqual(DEFAULT);
  });
});
