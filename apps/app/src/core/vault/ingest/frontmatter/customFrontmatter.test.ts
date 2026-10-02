import { describe, expect, it } from 'vitest';

import { FrontmatterParser } from '../FrontmatterParser';
import {
  isReservedPropertyName,
  readCustomProperties,
  renameCustomProperty,
  validateCustomPropertyName,
} from './customFrontmatter';
import { OWNED_FRONTMATTER_KEYS } from './ownedFrontmatterKeys';

/** The page's preserved custom lines, exactly as the parser captures them. */
function customLines(yaml: string): readonly string[] {
  return new FrontmatterParser().parse(`---\nid: a\n${yaml}\n---\nbody`).frontmatter.unownedLines ?? [];
}

describe('readCustomProperties', () => {
  it('reads every custom key in file order, inferring its type from the value', () => {
    const lines = customLines(
      [
        'priority: high',
        'estimate: 3.5',
        'done: true',
        'due: 2026-10-01',
        'link: https://example.com/a',
        'people:',
        '  - Ana',
        '  - "Bo, Jr"',
        'labels: [x, y]',
        'quoted: "42"',
        'empty:',
      ].join('\n')
    );

    expect(readCustomProperties(lines)).toEqual([
      { key: 'priority', type: 'text', value: 'high' },
      { key: 'estimate', type: 'number', value: 3.5 },
      { key: 'done', type: 'boolean', value: true },
      { key: 'due', type: 'date', value: '2026-10-01' },
      { key: 'link', type: 'url', value: 'https://example.com/a' },
      { key: 'people', type: 'list', value: ['Ana', 'Bo, Jr'] },
      { key: 'labels', type: 'list', value: ['x', 'y'] },
      { key: 'quoted', type: 'text', value: '42' },
      { key: 'empty', type: 'text', value: '' },
    ]);
  });

  it('never lists system keys — those are system properties', () => {
    const lines = customLines('tags:\n  - a\naliases: [b]\ncreated: 2026-01-01\npriority: high');
    expect(readCustomProperties(lines).map((property) => property.key)).toEqual(['priority']);
  });

  it('shows a nested mapping as its text', () => {
    const lines = customLines('meta:\n  owner: Ana\n  team: Core');
    expect(readCustomProperties(lines)).toEqual([
      { key: 'meta', type: 'text', value: 'owner: Ana\nteam: Core' },
    ]);
  });
});

describe('isReservedPropertyName', () => {
  it('matches every canonical system key in any letter case, not just UI labels', () => {
    for (const key of OWNED_FRONTMATTER_KEYS) {
      expect(isReservedPropertyName(key)).toBe(true);
      expect(isReservedPropertyName(key.toUpperCase())).toBe(true);
    }
    expect(isReservedPropertyName(' Tags ')).toBe(true);
    expect(isReservedPropertyName('coverlayout')).toBe(true);
    expect(isReservedPropertyName('Modified')).toBe(true);
    expect(isReservedPropertyName('priority')).toBe(false);
    // A UI label that isn't a key is not reserved by itself.
    expect(isReservedPropertyName('Cover image')).toBe(false);
  });
});

describe('validateCustomPropertyName', () => {
  const lines = customLines('priority: high\nowner: Ana');

  it.each([
    ['importance', null],
    ['  importance  ', null],
    ['Priority', null],
    ['priority', null],
    ['', 'empty'],
    ['   ', 'empty'],
    ['tags', 'reserved'],
    ['TAGS', 'reserved'],
    ['Created', 'reserved'],
    ['ALIASES', 'reserved'],
    ['a: b', 'unsupported'],
    ['# note', 'unsupported'],
    ['- item', 'unsupported'],
    ['owner', 'taken'],
  ])('%j → %s', (name, problem) => {
    expect(validateCustomPropertyName(lines, 'priority', name)).toBe(problem);
  });
});

describe('renameCustomProperty', () => {
  it('changes only the key text; the value and every other line stay byte-identical', () => {
    const lines = customLines(
      ['author: Jane', 'priority:   high  # keep me', 'people:', '  - Ana', '', '  - Bo', 'x: 1'].join('\n')
    );

    const renamed = renameCustomProperty(lines, 'priority', ' importance ');

    expect(renamed).toEqual(lines.map((line) => line.replace(/^priority:/, 'importance:')));
    expect(renamed).toContain('importance:   high  # keep me');
    expect(readCustomProperties(renamed).find((p) => p.key === 'importance')).toEqual({
      key: 'importance',
      type: 'text',
      value: 'high  # keep me',
    });
  });

  it('keeps a list value and its type', () => {
    const lines = customLines('people:\n  - Ana\n  - Bo');
    const renamed = renameCustomProperty(lines, 'people', 'team');
    expect(renamed).toEqual(['team:', '  - Ana', '  - Bo']);
    expect(readCustomProperties(renamed)).toEqual([{ key: 'team', type: 'list', value: ['Ana', 'Bo'] }]);
  });

  it('throws on an invalid name or a missing key', () => {
    const lines = customLines('priority: high');
    expect(() => renameCustomProperty(lines, 'priority', 'Tags')).toThrow(/reserved/);
    expect(() => renameCustomProperty(lines, 'missing', 'x')).toThrow(/No custom property/);
  });
});
