import { describe, expect, it } from 'vitest';

import { FrontmatterParser } from '../FrontmatterParser';
import {
  isReservedPropertyName,
  readCustomProperties,
  validateCustomPropertyName,
} from './customFrontmatter';
import { isReservedRawKey, OWNED_FRONTMATTER_KEYS, matchSystemKey } from './ownedFrontmatterKeys';
import {
  addVisibleProperty,
  isPropertiesSectionHidden,
  normalizePropertiesConfig,
  readListedSystemProperties,
  removePropertiesBlock,
  removePropertiesListing,
  removeVisibleProperty,
  setPropertiesSectionHidden,
} from './propertyVisibility';

/** The page's preserved custom lines, exactly as the parser captures them. */
function customLines(yaml: string): readonly string[] {
  return new FrontmatterParser().parse(`---\nid: a\n${yaml}\n---\nbody`).frontmatter.unownedLines ?? [];
}

describe('readListedSystemProperties', () => {
  it('no properties.visible means none listed', () => {
    expect(readListedSystemProperties([])).toEqual([]);
    expect(readListedSystemProperties(customLines('priority: high'))).toEqual([]);
    expect(readListedSystemProperties(customLines('properties:\n  other: 1'))).toEqual([]);
    expect(readListedSystemProperties(customLines('properties:\n  visible:'))).toEqual([]);
    expect(readListedSystemProperties(customLines('properties:\n  visible: []'))).toEqual([]);
  });

  it('reads a block list and a one-line flow list', () => {
    expect(readListedSystemProperties(customLines('properties:\n  visible:\n    - tags\n    - created'))).toEqual([
      'tags',
      'created',
    ]);
    expect(readListedSystemProperties(customLines('properties:\n  visible: [aliases, "modified"]'))).toEqual([
      'aliases',
      'modified',
    ]);
  });

  it('returns the canonical system order — Tags, Aliases, Created, Last edited — whatever order is written', () => {
    expect(
      readListedSystemProperties(customLines('properties:\n  visible:\n    - modified\n    - created\n    - aliases\n    - tags'))
    ).toEqual(['tags', 'aliases', 'created', 'modified']);
  });

  it('matches keys ignoring letter case, lists each once, and ignores anything that is not a page system key', () => {
    expect(
      readListedSystemProperties(
        customLines('properties:\n  visible:\n    - Tags\n    - ALIASES\n    - tags\n    - Due date\n    - lastOpened')
      )
    ).toEqual(['tags', 'aliases']);
  });

  it('is found among other keys, and ignores a `visible` that is not under `properties`', () => {
    expect(readListedSystemProperties(customLines('author: Jane\nproperties:\n  visible:\n    - tags\nx: 1'))).toEqual([
      'tags',
    ]);
    expect(readListedSystemProperties(customLines('visible:\n  - tags'))).toEqual([]);
  });
});

describe('addVisibleProperty', () => {
  it('creates the block when there is none, after every existing line', () => {
    expect(addVisibleProperty(customLines('author: Jane\npriority: high'), 'tags')).toEqual([
      'author: Jane',
      'priority: high',
      'properties:',
      '  visible:',
      '    - tags',
    ]);
  });

  it('creates `visible` inside an existing `properties` block, keeping what is already there', () => {
    expect(addVisibleProperty(customLines('properties:\n  order: [a, b]\nx: 1'), 'created')).toEqual([
      'properties:',
      '  order: [a, b]',
      '  visible:',
      '    - created',
      'x: 1',
    ]);
  });

  it('appends to an existing block list, in its indentation, without reordering', () => {
    const added = addVisibleProperty(customLines('properties:\n    visible:\n        - tags\nx: 1'), 'created');

    expect(added).toEqual(['properties:', '    visible:', '        - tags', '        - created', 'x: 1']);
  });

  it('appends to an empty `visible:` and to a flow list, keeping existing entries as written', () => {
    expect(addVisibleProperty(customLines('properties:\n  visible:'), 'tags')).toEqual([
      'properties:',
      '  visible:',
      '    - tags',
    ]);
    expect(addVisibleProperty(customLines('properties:\n  visible: [tags]'), 'created')).toEqual([
      'properties:',
      '  visible: [tags, created]',
    ]);
    expect(addVisibleProperty(customLines('properties:\n  visible: []'), 'tags')).toEqual([
      'properties:',
      '  visible: [tags]',
    ]);
  });

  it('a key already listed (in any letter case) changes nothing', () => {
    const lines = customLines('properties:\n  visible:\n    - Tags');

    expect(addVisibleProperty(lines, 'tags')).toEqual(lines);
  });

  it('never touches any other line, whatever follows the block', () => {
    const lines = customLines('a: 1\nproperties:\n  visible:\n    - tags\nb:\n  - x');

    expect(addVisibleProperty(lines, 'aliases')).toEqual([
      'a: 1',
      'properties:',
      '  visible:',
      '    - tags',
      '    - aliases',
      'b:',
      '  - x',
    ]);
  });

  it('refuses to overwrite a `properties` or `visible` it cannot extend', () => {
    expect(() => addVisibleProperty(customLines('properties: nope'), 'tags')).toThrow(/not a mapping/);
    expect(() => addVisibleProperty(customLines('properties:\n  visible: nope'), 'tags')).toThrow(/not a list/);
  });
});

describe('removeVisibleProperty', () => {
  it('removes only that entry from a block list; the rest keeps its order and every other line is untouched', () => {
    expect(
      removeVisibleProperty(
        customLines('a: 1\nproperties:\n  visible:\n    - tags\n    - created\n    - aliases\nb: 2'),
        'created'
      )
    ).toEqual(['a: 1', 'properties:', '  visible:', '    - tags', '    - aliases', 'b: 2']);
  });

  it('removes an entry of a flow list, keeping the others as written, and every spelling of the key', () => {
    expect(removeVisibleProperty(customLines('properties:\n  visible: [tags, "Created", aliases]'), 'created')).toEqual([
      'properties:',
      '  visible: [tags, aliases]',
    ]);
    expect(removeVisibleProperty(customLines('properties:\n  visible:\n    - Tags\n    - tags'), 'tags')).toEqual([
      'properties:',
      '  visible:',
    ]);
  });

  it('keeps the `visible:` line when the last entry goes', () => {
    expect(removeVisibleProperty(customLines('properties:\n  visible:\n    - tags'), 'tags')).toEqual([
      'properties:',
      '  visible:',
    ]);
  });

  it('leaves other keys under `properties:` alone, and changes nothing when the key is not listed or there is no list', () => {
    const lines = customLines('properties:\n  other: 1\n  visible:\n    - tags');

    expect(removeVisibleProperty(lines, 'created')).toEqual(lines);
    expect(removeVisibleProperty(customLines('priority: high'), 'tags')).toEqual(['priority: high']);
    expect(removeVisibleProperty(lines, 'tags')).toEqual(['properties:', '  other: 1', '  visible:']);
  });

  it('removing then adding again lists it again — the value was never part of this', () => {
    const removed = removeVisibleProperty(customLines('properties:\n  visible:\n    - tags\n    - aliases'), 'tags');

    expect(readListedSystemProperties(removed)).toEqual(['aliases']);
    expect(readListedSystemProperties(addVisibleProperty(removed, 'tags'))).toEqual(['tags', 'aliases']);
  });
});

describe('isPropertiesSectionHidden', () => {
  it('only an explicit `show: false` hides the section', () => {
    expect(isPropertiesSectionHidden(customLines('properties:\n  show: false'))).toBe(true);
    expect(isPropertiesSectionHidden(customLines("properties:\n  show: 'false'  # why"))).toBe(true);
  });

  it('a missing block or `show`, `show: true` (legacy) and anything else mean the normal state', () => {
    expect(isPropertiesSectionHidden([])).toBe(false);
    expect(isPropertiesSectionHidden(customLines('properties:\n  visible:\n    - tags'))).toBe(false);
    expect(isPropertiesSectionHidden(customLines('properties:\n  show: true'))).toBe(false);
    expect(isPropertiesSectionHidden(customLines('properties:\n  show: maybe'))).toBe(false);
  });

  it('only a direct child `show` counts: not one nested deeper, nor outside `properties`', () => {
    expect(isPropertiesSectionHidden(customLines('properties:\n  other:\n    show: false\n  visible:'))).toBe(false);
    expect(isPropertiesSectionHidden(customLines('show: false'))).toBe(false);
  });
});

describe('setPropertiesSectionHidden', () => {
  it('hiding creates the block after every existing line, with `show: false` only', () => {
    expect(setPropertiesSectionHidden(customLines('author: Jane'), true)).toEqual([
      'author: Jane',
      'properties:',
      '  show: false',
    ]);
  });

  it('hiding adds `show: false` first in an existing block, keeping `visible` and everything else byte-identical', () => {
    expect(setPropertiesSectionHidden(customLines('a: 1\nproperties:\n  visible:\n    - tags\nb: 2'), true)).toEqual([
      'a: 1',
      'properties:',
      '  show: false',
      '  visible:',
      '    - tags',
      'b: 2',
    ]);
  });

  it('hiding an existing `show:` rewrites it in place, keeping its indentation and any comment', () => {
    expect(setPropertiesSectionHidden(customLines('properties:\n    show: true  # old\n    visible:\n        - tags'), true)).toEqual([
      'properties:',
      '    show: false  # old',
      '    visible:',
      '        - tags',
    ]);
  });

  it('showing removes the `show:` override — `show: true` is never written — and the block when nothing else is in it', () => {
    expect(setPropertiesSectionHidden(customLines('a: 1\nproperties:\n  show: false\nb: 2'), false)).toEqual(['a: 1', 'b: 2']);
    expect(setPropertiesSectionHidden(customLines('properties:\n  show: false\n  visible:\n    - tags'), false)).toEqual([
      'properties:',
      '  visible:',
      '    - tags',
    ]);
  });

  it('showing a section that is not hidden changes nothing', () => {
    const lines = customLines('properties:\n  visible:\n    - tags');

    expect(setPropertiesSectionHidden(lines, false)).toEqual(lines);
    expect(setPropertiesSectionHidden(customLines('a: 1'), false)).toEqual(['a: 1']);
  });

  it('never writes `show: true`', () => {
    for (const yaml of ['a: 1', 'properties:\n  visible:\n    - tags', 'properties:\n  show: false']) {
      for (const hidden of [true, false]) {
        expect(setPropertiesSectionHidden(customLines(yaml), hidden).join('\n')).not.toMatch(/show:\s*true/);
      }
    }
  });

  it('hiding and showing never touch `visible`', () => {
    const lines = customLines('properties:\n  visible: [tags, created]');
    const hidden = setPropertiesSectionHidden(lines, true);

    expect(readListedSystemProperties(hidden)).toEqual(['tags', 'created']);
    expect(readListedSystemProperties(setPropertiesSectionHidden(hidden, false))).toEqual(['tags', 'created']);
  });

  it('refuses to overwrite a `properties` that is not a mapping', () => {
    expect(() => setPropertiesSectionHidden(customLines('properties: nope'), true)).toThrow(/not a mapping/);
  });
});

describe('normalizePropertiesConfig — an older note, brought to the current model', () => {
  it('drops a legacy `show: true` and keeps an explicit `show: false`', () => {
    expect(normalizePropertiesConfig(customLines('properties:\n  show: true\n  visible:\n    - tags'))).toEqual([
      'properties:',
      '  visible:',
      '    - tags',
    ]);
    expect(normalizePropertiesConfig(customLines('properties:\n  show: false\n  visible:\n    - tags'))).toEqual([
      'properties:',
      '  show: false',
      '  visible:',
      '    - tags',
    ]);
  });

  it('drops `visible: []` and an empty `visible:`, and the block with it when nothing else is in it', () => {
    expect(normalizePropertiesConfig(customLines('a: 1\nproperties:\n  show: true\n  visible: []\nb: 2'))).toEqual(['a: 1', 'b: 2']);
    expect(normalizePropertiesConfig(customLines('properties:\n  visible:'))).toEqual([]);
  });

  it('keeps only the system keys in `visible`, once each — a legacy custom entry goes', () => {
    expect(
      normalizePropertiesConfig(customLines('properties:\n  visible:\n    - tags\n    - Due date\n    - Tags\n    - created'))
    ).toEqual(['properties:', '  visible:', '    - tags', '    - created']);
    expect(normalizePropertiesConfig(customLines('properties:\n  visible: [tags, "Due date", created]'))).toEqual([
      'properties:',
      '  visible: [tags, created]',
    ]);
    expect(normalizePropertiesConfig(customLines('properties:\n  visible: [priority]'))).toEqual([]);
  });

  it('leaves other keys under `properties:` and every unrelated line byte-identical', () => {
    expect(normalizePropertiesConfig(customLines('a: 1\nproperties:\n  other: 1\n  show: true\nb: 2'))).toEqual([
      'a: 1',
      'properties:',
      '  other: 1',
      'b: 2',
    ]);
  });

  it('changes nothing when there is no block or it is already current', () => {
    const current = customLines('a: 1\nproperties:\n  visible:\n    - tags');

    expect(normalizePropertiesConfig(current)).toEqual(current);
    expect(normalizePropertiesConfig(customLines('a: 1'))).toEqual(['a: 1']);
    expect(normalizePropertiesConfig(customLines('properties: nope'))).toEqual(['properties: nope']);
  });
});

describe('`show` and `visible` are never custom properties', () => {
  const lines = customLines('author: Jane\nproperties:\n  show: true\n  visible:\n    - tags\npriority: high');

  it('are not listed as custom properties — only the note’s own keys are', () => {
    expect(readCustomProperties(lines).map((property) => property.key)).toEqual(['author', 'priority']);
    for (const result of [setPropertiesSectionHidden(lines, false), setPropertiesSectionHidden(customLines('x: 1'), true)]) {
      expect(readCustomProperties(result).map((property) => property.key)).not.toContain('show');
      expect(readCustomProperties(result).map((property) => property.key)).not.toContain('visible');
      expect(readCustomProperties(result).map((property) => property.key)).not.toContain('properties');
    }
  });

  it('a custom property may still be called `show` or `visible` — they are only reserved inside `properties`', () => {
    expect(validateCustomPropertyName(lines, '', 'show')).toBeNull();
    expect(validateCustomPropertyName(lines, '', 'visible')).toBeNull();
    // ...while `properties` itself stays reserved.
    expect(validateCustomPropertyName(lines, '', 'properties')).toBe('reserved');
  });
});

describe('`properties` is a reserved Clutter key, never a custom property', () => {
  const lines = customLines('author: Jane\nproperties:\n  visible:\n    - tags\npriority: high');

  it('is not listed as a custom property, whatever it holds', () => {
    expect(readCustomProperties(lines).map((property) => property.key)).toEqual(['author', 'priority']);
    expect(readCustomProperties(customLines('properties: x')).map((p) => p.key)).toEqual([]);
    expect(readCustomProperties(customLines('Properties:\n  other: 1')).map((p) => p.key)).toEqual([]);
  });

  it('cannot be given as a custom property name, in any letter case', () => {
    for (const name of ['properties', 'Properties', 'PROPERTIES', '  properties ']) {
      expect(isReservedPropertyName(name)).toBe(true);
      expect(validateCustomPropertyName(lines, '', name)).toBe('reserved');
    }
  });

  it('is reserved without being a parsed system key, so the parser keeps capturing its raw lines', () => {
    expect(isReservedRawKey('properties')).toBe(true);
    expect(OWNED_FRONTMATTER_KEYS.has('properties')).toBe(false);
    expect(matchSystemKey('properties')).toBeNull();
    // ...and so the parser preserves it verbatim.
    expect(lines).toEqual(['author: Jane', 'properties:', '  visible:', '    - tags', 'priority: high']);
  });
});

describe('removePropertiesBlock', () => {
  it('removes the whole block — show, visible and anything else under it — and nothing else', () => {
    const lines = customLines('priority: high\nproperties:\n  show: false\n  visible:\n    - tags\n    - created\n  other: 1\nmood: ok');

    expect(removePropertiesBlock(lines)).toEqual(['priority: high', 'mood: ok']);
  });

  it('leaves no properties key behind: nothing is hidden and nothing is listed', () => {
    const result = removePropertiesBlock(customLines('properties:\n  show: false\n  visible:\n    - tags'));

    expect(result).toEqual([]);
    expect(isPropertiesSectionHidden(result)).toBe(false);
    expect(readListedSystemProperties(result)).toEqual([]);
  });

  it('changes nothing when there is no block', () => {
    const lines = customLines('priority: high');

    expect(removePropertiesBlock(lines)).toEqual(lines);
  });
});

describe('removePropertiesListing', () => {
  it('removes show and visible, and the whole block when nothing else is configured under it', () => {
    expect(removePropertiesListing(customLines('priority: high\nproperties:\n  show: false\n  visible:\n    - tags\nmood: ok'))).toEqual([
      'priority: high',
      'mood: ok',
    ]);
  });

  it('leaves no empty visible list and no show behind', () => {
    for (const yaml of ['properties:\n  show: false\n  visible:', 'properties:\n  show: true\n  visible: []', 'properties:\n  visible: [tags]']) {
      expect(removePropertiesListing(customLines(yaml))).toEqual([]);
    }
  });

  it('keeps the block, byte-identical, when something else is configured under it', () => {
    expect(removePropertiesListing(customLines('properties:\n  show: false\n  other: 1\n  visible:\n    - tags'))).toEqual([
      'properties:',
      '  other: 1',
    ]);
  });

  it('changes nothing when there is no block', () => {
    const lines = customLines('priority: high');

    expect(removePropertiesListing(lines)).toEqual(lines);
  });
});
