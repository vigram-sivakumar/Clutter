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
  readVisibleProperties,
  removeVisibleProperty,
  renameVisibleProperty,
} from './propertyVisibility';

/** The page's preserved custom lines, exactly as the parser captures them. */
function customLines(yaml: string): readonly string[] {
  return new FrontmatterParser().parse(`---\nid: a\n${yaml}\n---\nbody`).frontmatter.unownedLines ?? [];
}

describe('readVisibleProperties', () => {
  it('no properties.visible means nothing is shown', () => {
    expect(readVisibleProperties([])).toEqual([]);
    expect(readVisibleProperties(customLines('priority: high'))).toEqual([]);
    expect(readVisibleProperties(customLines('properties:\n  other: 1'))).toEqual([]);
    expect(readVisibleProperties(customLines('properties:\n  visible:'))).toEqual([]);
  });

  it('reads a block list in file order', () => {
    expect(
      readVisibleProperties(customLines('properties:\n  visible:\n    - tags\n    - Due date\n    - created'))
    ).toEqual(['tags', 'Due date', 'created']);
  });

  it('reads a one-line flow list, unquoting entries, and skips empty ones', () => {
    expect(readVisibleProperties(customLines('properties:\n  visible: [tags, "Due, date", \'x\']'))).toEqual([
      'tags',
      'Due, date',
      'x',
    ]);
    expect(readVisibleProperties(customLines('properties:\n  visible: []'))).toEqual([]);
  });

  it('is found among other keys, and ignores a `visible` that is not under `properties`', () => {
    expect(
      readVisibleProperties(customLines('author: Jane\nproperties:\n  visible:\n    - tags\nx: 1'))
    ).toEqual(['tags']);
    expect(readVisibleProperties(customLines('visible:\n  - tags'))).toEqual([]);
  });
});

describe('addVisibleProperty', () => {
  it('creates the block when there is none, after every existing line', () => {
    const lines = customLines('author: Jane\npriority: high');

    expect(addVisibleProperty(lines, 'tags')).toEqual([
      'author: Jane',
      'priority: high',
      'properties:',
      '  visible:',
      '    - tags',
    ]);
  });

  it('creates `visible` inside an existing `properties` block, keeping what is already there', () => {
    const lines = customLines('properties:\n  order: [a, b]\nx: 1');

    expect(addVisibleProperty(lines, 'created')).toEqual([
      'properties:',
      '  order: [a, b]',
      '  visible:',
      '    - created',
      'x: 1',
    ]);
  });

  it('appends to an existing block list, in its indentation, without reordering', () => {
    const lines = customLines('properties:\n    visible:\n        - tags\n        - Due date\nx: 1');
    const added = addVisibleProperty(lines, 'created');

    expect(added).toEqual([
      'properties:',
      '    visible:',
      '        - tags',
      '        - Due date',
      '        - created',
      'x: 1',
    ]);
    expect(readVisibleProperties(added)).toEqual(['tags', 'Due date', 'created']);
  });

  it('appends to an empty `visible:` and to a flow list, keeping existing entries as written', () => {
    expect(addVisibleProperty(customLines('properties:\n  visible:'), 'tags')).toEqual([
      'properties:',
      '  visible:',
      '    - tags',
    ]);
    expect(addVisibleProperty(customLines('properties:\n  visible: [tags, "a, b"]'), 'created')).toEqual([
      'properties:',
      '  visible: [tags, "a, b", created]',
    ]);
    expect(addVisibleProperty(customLines('properties:\n  visible: []'), 'tags')).toEqual([
      'properties:',
      '  visible: [tags]',
    ]);
  });

  it('keeps insertion order across several additions — it only ever appends', () => {
    let lines: readonly string[] = customLines('priority: high');

    for (const key of ['modified', 'tags', 'Due date', 'aliases']) {
      lines = addVisibleProperty(lines, key);
    }

    expect(readVisibleProperties(lines)).toEqual(['modified', 'tags', 'Due date', 'aliases']);
  });

  it('a key already listed changes nothing', () => {
    const lines = customLines('properties:\n  visible:\n    - tags\n    - created');

    expect(addVisibleProperty(lines, 'tags')).toEqual(lines);
    expect(addVisibleProperty(lines, '  created  ')).toEqual(lines);
  });

  it('quotes a key only where a plain value would be misread, and reads it back', () => {
    const lines = addVisibleProperty(addVisibleProperty([], 'Due date'), '2026: plan');

    expect(lines.slice(-2)).toEqual(['    - Due date', '    - "2026: plan"']);
    expect(readVisibleProperties(lines)).toEqual(['Due date', '2026: plan']);
  });

  it('never touches any other line, whatever follows the block', () => {
    const lines = customLines('a: 1\nproperties:\n  visible:\n    - tags\n\nb:\n  - x\nc: [1, 2]');
    const added = addVisibleProperty(lines, 'aliases');

    expect(added.filter((line) => !line.includes('aliases'))).toEqual(lines);
    expect(added).toHaveLength(lines.length + 1);
  });

  it('refuses to overwrite a `properties` or `visible` it cannot extend', () => {
    expect(() => addVisibleProperty(customLines('properties: none'), 'tags')).toThrow(/not a mapping/);
    expect(() => addVisibleProperty(customLines('properties:\n  visible: tags'), 'tags')).toThrow(/not a list/);
    expect(() => addVisibleProperty([], '  ')).toThrow();
  });
});

describe('renameVisibleProperty', () => {
  it('rewrites the entry in place, keeping its position and every other line', () => {
    const lines = customLines('properties:\n  visible:\n    - tags\n    - Due\n    - created\nx: 1');

    expect(renameVisibleProperty(lines, 'Due', 'Deadline')).toEqual([
      'properties:',
      '  visible:',
      '    - tags',
      '    - Deadline',
      '    - created',
      'x: 1',
    ]);
  });

  it('rewrites an entry of a flow list, and quotes the new name when needed', () => {
    expect(renameVisibleProperty(customLines('properties:\n  visible: [tags, Due]'), 'Due', 'a, b')).toEqual([
      'properties:',
      '  visible: [tags, "a, b"]',
    ]);
  });

  it('changes nothing when the old key is not listed, or there is no list', () => {
    const lines = customLines('properties:\n  visible:\n    - tags');

    expect(renameVisibleProperty(lines, 'Due', 'Deadline')).toEqual(lines);
    expect(renameVisibleProperty(customLines('priority: high'), 'priority', 'p')).toEqual(['priority: high']);
  });
});

describe('removeVisibleProperty', () => {
  it('removes only that entry from a block list; the rest keeps its order and every other line is untouched', () => {
    const lines = customLines('a: 1\nproperties:\n  visible:\n    - tags\n    - Due date\n    - created\nb: 2');

    expect(removeVisibleProperty(lines, 'Due date')).toEqual([
      'a: 1',
      'properties:',
      '  visible:',
      '    - tags',
      '    - created',
      'b: 2',
    ]);
    expect(readVisibleProperties(removeVisibleProperty(lines, 'tags'))).toEqual(['Due date', 'created']);
  });

  it('removes an entry of a flow list, keeping the others as written', () => {
    expect(removeVisibleProperty(customLines('properties:\n  visible: [tags, "a, b", created]'), 'tags')).toEqual([
      'properties:',
      '  visible: ["a, b", created]',
    ]);
    expect(removeVisibleProperty(customLines('properties:\n  visible: [tags]'), 'tags')).toEqual([
      'properties:',
      '  visible: []',
    ]);
  });

  it('keeps the `visible:` line when the last entry goes, so showing again appends under it', () => {
    const emptied = removeVisibleProperty(customLines('properties:\n  visible:\n    - tags'), 'tags');

    expect(emptied).toEqual(['properties:', '  visible:']);
    expect(readVisibleProperties(emptied)).toEqual([]);
    expect(readVisibleProperties(addVisibleProperty(emptied, 'created'))).toEqual(['created']);
  });

  it('leaves other keys under `properties:` and unrelated lines alone', () => {
    const lines = customLines('properties:\n  order: [a]\n  visible:\n    - tags\nx: 1');

    expect(removeVisibleProperty(lines, 'tags')).toEqual(['properties:', '  order: [a]', '  visible:', 'x: 1']);
  });

  it('changes nothing when the key is not listed, or there is no list', () => {
    const lines = customLines('properties:\n  visible:\n    - tags');

    expect(removeVisibleProperty(lines, 'created')).toEqual(lines);
    expect(removeVisibleProperty(customLines('priority: high'), 'tags')).toEqual(['priority: high']);
    expect(removeVisibleProperty([], 'tags')).toEqual([]);
  });

  it('hiding then showing again puts the key back at the end, never touching the property itself', () => {
    const lines = customLines('priority: high\nproperties:\n  visible:\n    - priority\n    - tags');
    const hidden = removeVisibleProperty(lines, 'priority');

    expect(hidden).toContain('priority: high');
    expect(readVisibleProperties(addVisibleProperty(hidden, 'priority'))).toEqual(['tags', 'priority']);
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
