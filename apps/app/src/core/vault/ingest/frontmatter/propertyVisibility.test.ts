import { describe, expect, it } from 'vitest';

import { FrontmatterParser } from '../FrontmatterParser';
import { FrontmatterSerializer } from '../FrontmatterSerializer';
import { PageBuilder } from '../PageBuilder';
import { isReservedPropertyName, readCustomProperties, validateCustomPropertyName } from './customFrontmatter';
import { isReservedRawKey, matchSystemKey, OWNED_FRONTMATTER_KEYS } from './ownedFrontmatterKeys';
import { isPropertiesSectionHidden, readListedSystemProperties, setPropertiesSectionHidden } from './propertyVisibility';
import { readVisibleCustomProperties } from './templateMarker';

/** The page's preserved custom lines, exactly as the parser captures them. */
function customLines(yaml: string): readonly string[] {
  return new FrontmatterParser().parse(`---\nid: a\n${yaml}\n---\nbody`).frontmatter.unownedLines ?? [];
}

/** What a parsed note offers the property model: its preserved lines and the entry order the parser recorded. */
function stateOf(yaml: string) {
  const { frontmatter } = new FrontmatterParser().parse(`---\nid: a\n${yaml}\n---\nbody`);

  return { lines: frontmatter.unownedLines ?? [], order: frontmatter.entryOrder };
}

describe('readListedSystemProperties — a system property is declared by its key (ADR-058)', () => {
  it('lists the system properties whose keys are entries of the file, in the canonical system order', () => {
    expect(readListedSystemProperties(stateOf('modified: true\ncreated: true\naliases:\n  - a\ntags:\n  - t').order)).toEqual([
      'tags',
      'aliases',
      'created',
      'modified',
    ]);
  });

  it('a key with an empty value is still a declaration (`tags: []`)', () => {
    expect(readListedSystemProperties(stateOf('created: true\ntags: []').order)).toEqual(['tags', 'created']);
  });

  it('`created: true` and `modified: true` declare Created and Last edited', () => {
    expect(readListedSystemProperties(stateOf('created: true\nmodified: true').order)).toEqual(['created', 'modified']);
  });

  it('matches keys ignoring letter case (`Tags:`, `CREATED:`)', () => {
    expect(readListedSystemProperties(stateOf('Tags:\n  - t\nCREATED: true').order)).toEqual(['tags', 'created']);
  });

  it('nothing is listed without those keys — custom keys, `favorite`, `icon`, `id` and `showProperties` are not system properties', () => {
    expect(readListedSystemProperties(undefined)).toEqual([]);
    expect(readListedSystemProperties([])).toEqual([]);
    expect(readListedSystemProperties(stateOf('priority: high\nfavorite: true\nicon: x\nshowProperties: false').order)).toEqual([]);
  });

  it('a `properties:` block is nothing special any more: it lists nothing and is an ordinary custom property', () => {
    const state = stateOf('properties:\n  visible:\n    - tags\n    - created');

    expect(readListedSystemProperties(state.order)).toEqual([]);
    expect(readVisibleCustomProperties(state.lines).map((property) => property.key)).toEqual(['properties']);
    expect(isReservedRawKey('properties')).toBe(false);
  });
});

describe('isPropertiesSectionHidden — showProperties', () => {
  it('only `showProperties: false` hides the section', () => {
    expect(isPropertiesSectionHidden(customLines('showProperties: false'))).toBe(true);
    for (const yaml of ['', 'priority: high', 'showProperties: true', 'showProperties:', 'showProperties: no', 'showProperties: 0']) {
      expect(isPropertiesSectionHidden(customLines(yaml))).toBe(false);
    }
  });

  it('accepts the other spellings of false, a quoted value, a trailing comment and any letter case of the key', () => {
    for (const yaml of ['showProperties: False', 'showProperties: FALSE', 'showProperties: "false"', "showProperties: 'false'", 'showProperties: false # hidden', 'ShowProperties: false']) {
      expect(isPropertiesSectionHidden(customLines(yaml))).toBe(true);
    }
  });
});

describe('setPropertiesSectionHidden', () => {
  it('hiding appends `showProperties: false` after every existing line and changes nothing else', () => {
    const lines = customLines('priority: high\nnotes:\n  - a');

    expect(setPropertiesSectionHidden(lines, true)).toEqual([...lines, 'showProperties: false']);
  });

  it('hiding an already hidden section rewrites the value in place, keeping the key spelling and a trailing comment', () => {
    expect(setPropertiesSectionHidden(customLines('a: 1\nShowProperties: true # was shown\nb: 2'), true)).toEqual([
      'a: 1',
      'ShowProperties: false # was shown',
      'b: 2',
    ]);
    const hidden = customLines('a: 1\nshowProperties: false\nb: 2');
    expect(setPropertiesSectionHidden(hidden, true)).toEqual(hidden);
  });

  it('showing removes the entry — `showProperties: true` is never written — and nothing else', () => {
    expect(setPropertiesSectionHidden(customLines('a: 1\nshowProperties: false\nb: 2'), false)).toEqual(['a: 1', 'b: 2']);
    const shown = customLines('a: 1\nb: 2');
    expect(setPropertiesSectionHidden(shown, false)).toEqual(shown);
  });

  it('hide then show returns the original lines', () => {
    const lines = customLines('a: 1\nlist:\n  - x\nb: 2');

    expect(setPropertiesSectionHidden(setPropertiesSectionHidden(lines, true), false)).toEqual(lines);
  });
});

describe('`showProperties` is a presentation setting, never a property', () => {
  const lines = customLines('author: Jane\nshowProperties: false\npriority: high');

  it('is not a custom property, in any letter case', () => {
    expect(readCustomProperties(lines).map((property) => property.key)).toEqual(['author', 'priority']);
    expect(readVisibleCustomProperties(customLines('ShowProperties: false\nx: 1')).map((property) => property.key)).toEqual(['x']);
  });

  it('cannot be given as a custom property name', () => {
    for (const name of ['showProperties', 'ShowProperties', 'SHOWPROPERTIES', ' showProperties ']) {
      expect(isReservedPropertyName(name)).toBe(true);
      expect(validateCustomPropertyName(lines, '', name)).toBe('reserved');
    }
  });

  it('is reserved without being a parsed system key, so the parser keeps its raw line', () => {
    expect(isReservedRawKey('showProperties')).toBe(true);
    expect(OWNED_FRONTMATTER_KEYS.has('showProperties')).toBe(false);
    expect(matchSystemKey('showProperties')).toBeNull();
    expect(lines).toEqual(['author: Jane', 'showProperties: false', 'priority: high']);
  });

  it('survives a save byte-for-byte, wherever it sits, and a save never adds one', () => {
    const document = '---\nid: a\ncreated: true\nshowProperties: false\ntags:\n  - t\n---\nBody';
    const parsed = new FrontmatterParser().parse(document);
    const page = new PageBuilder('/vault').build({
      parentId: null,
      page: {
        path: '/vault/N.md',
        directoryPath: '/vault',
        frontmatter: parsed.frontmatter,
        frontmatterAnalysis: { aliases: [] },
        content: parsed.body,
        analysis: parsed.analysis,
      } as never,
    });
    const written = new FrontmatterSerializer().serializeDocument(page, parsed.body);

    expect(written).toContain('created: true\nshowProperties: false\ntags:\n  - t\n');
    expect(
      new FrontmatterSerializer().serializeDocument(
        { ...page, metadata: { ...page.metadata, frontmatterEntryOrder: undefined, unownedFrontmatter: [] } },
        'Body'
      )
    ).not.toContain('showProperties');
  });
});
