import { describe, expect, it } from 'vitest';

import { FrontmatterParser } from '../FrontmatterParser';
import {
  addCustomProperty,
  formatCustomScalar,
  isReservedPropertyName,
  removeCustomListItem,
  readCustomProperties,
  renameCustomProperty,
  setCustomListValue,
  setCustomScalarValue,
  toCustomUrl,
  validateCustomPropertyName,
} from './customFrontmatter';
import { OWNED_FRONTMATTER_KEYS } from './ownedFrontmatterKeys';

/** The page's preserved custom lines, exactly as the parser captures them. */
function customLines(yaml: string): readonly string[] {
  return new FrontmatterParser().parse(`---\nid: a\n${yaml}\n---\nbody`).frontmatter.unownedLines ?? [];
}

describe('readCustomProperties', () => {
  it('a YAML sequence is a list whatever its length: `[]` is not text', () => {
    expect(readCustomProperties(customLines('people: []'))).toEqual([
      { key: 'people', type: 'list', value: [] },
    ]);
  });

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

describe('readCustomProperties — conservative type inference', () => {
  const typeOf = (yamlValue: string) => {
    const [property] = readCustomProperties(customLines(`field: ${yamlValue}`));
    return { type: property!.type, value: property!.value };
  };

  it.each([
    ['true', 'boolean', true],
    ['False', 'boolean', false],
    ['TRUE', 'boolean', true],
    ['42', 'number', 42],
    ['-3.5', 'number', -3.5],
    ['0', 'number', 0],
    ['1e3', 'number', 1000],
    ['2026-02-28', 'date', '2026-02-28'],
    ['2026-10-01T09:30:00Z', 'date', '2026-10-01T09:30:00Z'],
    ['2026-10-01T09:30+05:30', 'date', '2026-10-01T09:30+05:30'],
    ['https://example.com/docs?x=1', 'url', 'https://example.com/docs?x=1'],
    ['http://localhost:3000', 'url', 'http://localhost:3000'],
    ['[a, "b, c"]', 'list', ['a', 'b, c']],
    ['plain words', 'text', 'plain words'],
  ])('%s → %s', (yamlValue, type, value) => {
    expect(typeOf(yamlValue)).toEqual({ type, value });
  });

  it.each([
    // Look-alikes that aren't confidently that type.
    ['2026-13-45', 'not a real calendar date'],
    ['2026-02-30', 'not a real calendar date'],
    ['2026/10/01', 'not ISO'],
    ['10/01/2026', 'locale-dependent'],
    ['https://', 'no host'],
    ['example.com', 'bare domain'],
    ['mailto:a@b.co', 'not a web URL'],
    ['007', 'leading zeros — an id, not 7'],
    ['1_000', 'YAML-only number form'],
    ['0x1F', 'YAML-only number form'],
    ['.inf', 'YAML-only number form'],
    ['yes', 'YAML 1.1 boolean'],
    ['on', 'YAML 1.1 boolean'],
    ['"true"', 'quoted → a string'],
    ['"42"', 'quoted → a string'],
    ['[1, 2]', 'not a string array'],
    ['[a, true]', 'not a string array'],
    ['[a, [b]]', 'nested list'],
    ['[a, {b: c}]', 'nested mapping'],
  ])('%s falls back to text (%s)', (yamlValue) => {
    expect(typeOf(yamlValue).type).toBe('text');
  });

  it.each([
    ['a nested mapping', 'meta:\n  owner: Ana'],
    ['a block scalar', 'notes: |\n  line one\n  line two'],
    ['a block list of mappings', 'people:\n  - name: Ana\n  - name: Bo'],
    ['a block list of numbers', 'scores:\n  - 1\n  - 2'],
    ['an empty value', 'empty:'],
    ['null', 'gone: null'],
  ])('%s falls back to text', (_label, yaml) => {
    expect(readCustomProperties(customLines(yaml))[0]!.type).toBe('text');
  });

  it('never rewrites the frontmatter — inference only reads the preserved lines', () => {
    const lines = customLines('due: 2026-10-01\nscore: 007\nlink: https://example.com');
    const before = [...lines];
    readCustomProperties(lines);
    expect(lines).toEqual(before);
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
    ['OWNER', 'taken'],
    ['Owner', 'taken'],
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

describe('removeCustomListItem', () => {
  it('drops only that block-list item line; everything else is byte-identical', () => {
    const lines = customLines('author: Jane\npeople:\n  - Ana\n  - "Bo, Jr"\n  - Cy\nx: 1');

    expect(removeCustomListItem(lines, 'people', 1, 'Bo, Jr')).toEqual([
      'author: Jane',
      'people:',
      '  - Ana',
      '  - Cy',
      'x: 1',
    ]);
  });

  it('rewrites a flow list from its remaining items, keeping their quoting', () => {
    const lines = customLines('labels: [a, "b, c", \'d\']');
    expect(removeCustomListItem(lines, 'labels', 0, 'a')).toEqual(['labels: ["b, c", \'d\']']);
  });

  it('removing the last item empties the list: the key stays as `key: []`', () => {
    expect(removeCustomListItem(customLines('people:\n  - Ana'), 'people', 0, 'Ana')).toEqual(['people: []']);
    expect(removeCustomListItem(customLines('labels: [a]'), 'labels', 0, 'a')).toEqual(['labels: []']);

    const lines = customLines('author: Jane\npeople:\n  - Ana\nx: 1');
    expect(removeCustomListItem(lines, 'people', 0, 'Ana')).toEqual(['author: Jane', 'people: []', 'x: 1']);
  });

  it('refuses when the item there is no longer the one shown, or the property is not a list', () => {
    const lines = customLines('people:\n  - Ana\n  - Bo\npriority: high');
    expect(() => removeCustomListItem(lines, 'people', 0, 'Bo')).toThrow(/no item "Bo"/);
    expect(() => removeCustomListItem(lines, 'priority', 0, 'high')).toThrow(/No list property/);
  });
});

describe('setCustomListValue', () => {
  it.each([
    ['block', 'x: 1\npeople:\n  - Ana\n  - Bob\ny: 2', ['x: 1', 'people:', '  - Ana', 'y: 2']],
    ['flow', 'x: 1\npeople: [Ana, Bob]\ny: 2', ['x: 1', 'people: [Ana]', 'y: 2']],
  ])('[Ana, Bob] → [Ana] → [] (%s): the key stays, serialized `[]`, read back as an empty list', (_form, yaml, oneLeft) => {
    const one = removeCustomListItem(customLines(yaml), 'people', 1, 'Bob');
    expect(one).toEqual(oneLeft);

    const none = removeCustomListItem(one, 'people', 0, 'Ana');
    expect(none).toEqual(['x: 1', 'people: []', 'y: 2']);
    expect(readCustomProperties(none)).toEqual([
      { key: 'x', type: 'number', value: 1 },
      { key: 'people', type: 'list', value: [] },
      { key: 'y', type: 'number', value: 2 },
    ]);

    // And it can take a value again.
    expect(readCustomProperties(setCustomListValue(none, 'people', ['Cy']))[1]).toEqual({
      key: 'people',
      type: 'list',
      value: ['Cy'],
    });
  });

  it('adds a value to a block list, keeping its indentation and every other line', () => {
    const lines = customLines('author: Jane\npeople:\n    - Ana\n    - Bo\nx: 1');

    expect(setCustomListValue(lines, 'people', ['Ana', 'Bo', 'Cy'])).toEqual([
      'author: Jane',
      'people:',
      '    - Ana',
      '    - Bo',
      '    - Cy',
      'x: 1',
    ]);
  });

  it('edits a block-list value in place; unchanged items keep their spelling', () => {
    const lines = customLines('people:\n  - Ana\n  - "Bo, Jr"\n  - Cy');

    expect(setCustomListValue(lines, 'people', ['Ana', 'Bob', 'Cy'])).toEqual([
      'people:',
      '  - Ana',
      '  - Bob',
      '  - Cy',
    ]);
    expect(setCustomListValue(lines, 'people', ['Ana', 'Bo, Jr', 'Cy'])).toEqual(lines);
  });

  it('removes values from a block list; removing all empties it', () => {
    const lines = customLines('people:\n  - Ana\n  - Bo\npriority: high');

    expect(setCustomListValue(lines, 'people', ['Bo'])).toEqual(['people:', '  - Bo', 'priority: high']);
    expect(setCustomListValue(lines, 'people', [])).toEqual(['people: []', 'priority: high']);
    expect(setCustomListValue(lines, 'people', ['  '])).toEqual(['people: []', 'priority: high']);
  });

  it('rewrites a flow list as a flow list, keeping unchanged items as written and quoting only when needed', () => {
    const lines = customLines('labels: [a, "b, c", \'d\']');

    expect(setCustomListValue(lines, 'labels', ['a', 'b, c', "d", 'e', 'true'])).toEqual([
      'labels: [a, "b, c", \'d\', e, "true"]',
    ]);
    expect(setCustomListValue(lines, 'labels', ['x', 'b, c'])).toEqual(['labels: [x, "b, c"]']);
    expect(setCustomListValue(lines, 'labels', [])).toEqual(['labels: []']);
  });

  it('trims values and drops empty ones', () => {
    expect(setCustomListValue(customLines('labels: [a]'), 'labels', [' a ', '  ', 'b'])).toEqual([
      'labels: [a, b]',
    ]);
  });

  it('the written list reads back as the same values', () => {
    const values = ['Ana', 'Bo, Jr', 'true', '# not a comment', 'a: b'];

    for (const yaml of ['people:\n  - Ana', 'people: [Ana]']) {
      const written = setCustomListValue(customLines(yaml), 'people', values);
      expect(readCustomProperties(written)).toEqual([{ key: 'people', type: 'list', value: values }]);
    }
  });

  it('refuses a missing or non-list property and a value with a line break', () => {
    const lines = customLines('people:\n  - Ana\npriority: high');

    expect(() => setCustomListValue(lines, 'priority', ['x'])).toThrow(/No list property/);
    expect(() => setCustomListValue(lines, 'missing', ['x'])).toThrow(/No list property/);
    expect(() => setCustomListValue(lines, 'people', ['a\nb'])).toThrow(/line break/);
  });
});

describe('case-insensitive name uniqueness — add and rename use one rule', () => {
  const lines = customLines('Priority: high\nowner: Jane');

  it('rejects a name that differs from another custom key only by case, for a new property', () => {
    expect(validateCustomPropertyName(lines, '', 'priority')).toBe('taken');
    expect(validateCustomPropertyName(lines, '', 'PRIORITY')).toBe('taken');
    expect(validateCustomPropertyName(lines, '', 'Owner')).toBe('taken');
    expect(validateCustomPropertyName(lines, '', 'due')).toBeNull();
  });

  it('rejects the same for a rename, but lets a property change only its own letter case', () => {
    expect(validateCustomPropertyName(lines, 'owner', 'priority')).toBe('taken');
    expect(validateCustomPropertyName(lines, 'owner', 'PRIORITY')).toBe('taken');
    expect(validateCustomPropertyName(lines, 'Priority', 'priority')).toBeNull();
  });

  it('also rejects names the UI holds that are not in the lines yet', () => {
    expect(validateCustomPropertyName(lines, '', 'Draft', ['draft'])).toBe('taken');
  });

  it('reserved system names are rejected in any case, for a new property too', () => {
    expect(validateCustomPropertyName(lines, '', 'tags')).toBe('reserved');
    expect(validateCustomPropertyName(lines, '', 'MODIFIED')).toBe('reserved');
  });

  it('renameCustomProperty throws on a case-variant duplicate', () => {
    expect(() => renameCustomProperty(lines, 'owner', 'priority')).toThrow(/taken/);
  });
});

describe('typed empty values keep their type', () => {
  it.each([
    ['number', 'estimate: # number'],
    ['date', 'due: # date'],
    ['url', 'site: # url'],
  ] as const)('a comment-only value reads as an empty %s', (type, yaml) => {
    expect(readCustomProperties(customLines(yaml))).toEqual([
      { key: yaml.split(':')[0], type, value: null },
    ]);
  });

  it('a comment that is not a type hint stays text', () => {
    expect(readCustomProperties(customLines('x: # note'))[0]).toMatchObject({ type: 'text' });
  });

  it('formatCustomScalar writes the empty value of each type, and refuses it for a boolean', () => {
    expect(formatCustomScalar('number', null)).toBe('# number');
    expect(formatCustomScalar('date', null)).toBe('# date');
    expect(formatCustomScalar('url', null)).toBe('# url');
    expect(formatCustomScalar('text', null)).toBe('');
    expect(() => formatCustomScalar('boolean', null)).toThrow();
  });
});

describe('formatCustomScalar', () => {
  it('writes each type so it reads back as that type', () => {
    expect(formatCustomScalar('number', 3.5)).toBe('3.5');
    expect(formatCustomScalar('boolean', false)).toBe('false');
    expect(formatCustomScalar('date', ' 2026-10-02 ')).toBe('2026-10-02');
    expect(formatCustomScalar('url', 'https://example.com/a')).toBe('https://example.com/a');
    expect(formatCustomScalar('text', 'high')).toBe('high');
  });

  it('quotes text that would read as another type, so it stays text', () => {
    expect(formatCustomScalar('text', '42')).toBe('"42"');
    expect(formatCustomScalar('text', '2026-10-02')).toBe('"2026-10-02"');
    expect(formatCustomScalar('text', 'https://example.com')).toBe('"https://example.com"');
    expect(formatCustomScalar('text', 'a: b')).toBe('"a: b"');
  });

  it('refuses a value that would not read back as the type, or a line break', () => {
    expect(() => formatCustomScalar('number', Number.NaN)).toThrow();
    expect(() => formatCustomScalar('number', 'x' as never)).toThrow();
    expect(() => formatCustomScalar('date', '2026-02-30')).toThrow();
    expect(() => formatCustomScalar('url', 'example.com')).toThrow();
    expect(() => formatCustomScalar('text', 'a\nb')).toThrow();
  });
});

describe('setCustomScalarValue', () => {
  const lines = customLines('author: Jane\ndue: 2026-01-01\nnote: |\n  one\n  two\nx: 1');

  it('replaces only that property, keeping every other line byte-identical', () => {
    expect(setCustomScalarValue(lines, 'due', 'date', '2026-10-02')).toEqual([
      'author: Jane',
      'due: 2026-10-02',
      'note: |',
      '  one',
      '  two',
      'x: 1',
    ]);
  });

  it('replaces a whole block scalar with the new single line', () => {
    expect(setCustomScalarValue(lines, 'note', 'text', 'short')).toEqual([
      'author: Jane',
      'due: 2026-01-01',
      'note: short',
      'x: 1',
    ]);
  });

  it('clearing keeps the type: the key stays, the value reads back empty and typed', () => {
    const cleared = setCustomScalarValue(lines, 'due', 'date', null);

    expect(cleared[1]).toBe('due: # date');
    expect(readCustomProperties(cleared).find((p) => p.key === 'due')).toEqual({
      key: 'due',
      type: 'date',
      value: null,
    });
    // ...and it can be set again.
    expect(
      readCustomProperties(setCustomScalarValue(cleared, 'due', 'date', '2026-11-01')).find(
        (p) => p.key === 'due'
      )
    ).toEqual({ key: 'due', type: 'date', value: '2026-11-01' });
  });

  it('clearing a number or url keeps its type too; clearing text leaves an empty text value', () => {
    const typed = customLines('n: 3\nu: https://a.example\nt: hi');

    expect(readCustomProperties(setCustomScalarValue(typed, 'n', 'number', null))[0]).toEqual({
      key: 'n',
      type: 'number',
      value: null,
    });
    expect(readCustomProperties(setCustomScalarValue(typed, 'u', 'url', null))[1]).toEqual({
      key: 'u',
      type: 'url',
      value: null,
    });
    expect(setCustomScalarValue(typed, 't', 'text', null)[2]).toBe('t:');
  });

  it('refuses a list or a missing key', () => {
    const withList = customLines('people:\n  - Ana');
    expect(() => setCustomScalarValue(withList, 'people', 'text', 'x')).toThrow(/No scalar property/);
    expect(() => setCustomScalarValue(lines, 'missing', 'text', 'x')).toThrow(/No scalar property/);
  });
});

describe('addCustomProperty', () => {
  const lines = customLines('author: Jane\nPriority: high');

  it('appends the property after every existing line, which stay byte-identical', () => {
    expect(addCustomProperty(lines, ' Due date ', { type: 'date', value: null })).toEqual([
      ...lines,
      'Due date: # date',
    ]);
  });

  it.each([
    ['text', { type: 'text', value: null }, 'k:', { type: 'text', value: '' }],
    ['number', { type: 'number', value: null }, 'k: # number', { type: 'number', value: null }],
    ['date', { type: 'date', value: null }, 'k: # date', { type: 'date', value: null }],
    ['url', { type: 'url', value: null }, 'k: # url', { type: 'url', value: null }],
    ['boolean', { type: 'boolean', value: false }, 'k: false', { type: 'boolean', value: false }],
    ['multi-select', { type: 'multi-select', value: [] }, 'k: []', { type: 'list', value: [] }],
  ] as const)('a new empty %s property is written typed and reads back as that type', (_label, property, written, read) => {
    const result = addCustomProperty([], 'k', property);

    expect(result).toEqual([written]);
    expect(readCustomProperties(result)).toEqual([{ key: 'k', ...read }]);
  });

  it('writes a list with values as a block list', () => {
    expect(addCustomProperty([], 'people', { type: 'multi-select', value: ['Ana', 'Bo'] })).toEqual([
      'people:',
      '  - Ana',
      '  - Bo',
    ]);
  });

  it('rejects an empty, reserved, or case-insensitively duplicate name', () => {
    expect(() => addCustomProperty(lines, '  ', { type: 'text', value: 'x' })).toThrow(/empty/);
    expect(() => addCustomProperty(lines, 'Tags', { type: 'text', value: 'x' })).toThrow(/reserved/);
    expect(() => addCustomProperty(lines, 'priority', { type: 'text', value: 'x' })).toThrow(/taken/);
    expect(() => addCustomProperty(lines, 'AUTHOR', { type: 'text', value: 'x' })).toThrow(/taken/);
  });
});

describe('toCustomUrl', () => {
  it.each([
    ['https://example.com/a', 'https://example.com/a'],
    ['  http://localhost:3000  ', 'http://localhost:3000'],
    ['example.com', 'https://example.com'],
    ['www.example.co.uk/path?q=1', 'https://www.example.co.uk/path?q=1'],
  ])('%j → %s', (text, stored) => {
    expect(toCustomUrl(text)).toBe(stored);
    // What is stored reads back as a url.
    expect(readCustomProperties(customLines(`u: ${stored}`))[0]).toMatchObject({ type: 'url' });
  });

  it.each(['', '   ', 'plain words', 'mailto:a@b.co', 'a@b.co', 'readme', 'see example.com'])(
    '%j is not storable as a url',
    (text) => {
      expect(toCustomUrl(text)).toBeNull();
    }
  );
});
