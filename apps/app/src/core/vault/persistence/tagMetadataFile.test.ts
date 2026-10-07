import { describe, expect, it } from 'vitest';

import { parseTagMetadataFile, serializeTagMetadataFile } from './tagMetadataFile';

function entries(text: string) {
  const parsed = parseTagMetadataFile(text);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed;
}

describe('parseTagMetadataFile', () => {
  it('reads a v1 file (no version field) exactly like v2', () => {
    const { entries: map } = entries('{"tags":{"design":{"icon":"🎨","favorite":true}}}');

    expect(map.get('design')).toEqual({ icon: '🎨', favorite: true });
  });

  it('reads an empty file and an empty tags object as no definitions', () => {
    expect(entries('').entries.size).toBe(0);
    expect(entries('{"tags":{}}').entries.size).toBe(0);
    expect(entries('{}').entries.size).toBe(0);
  });

  it('an empty entry is a valid declaration', () => {
    expect(entries('{"version":2,"tags":{"research":{}}}').entries.get('research')).toEqual({});
  });

  it('normalizes keys, merging two spellings of one identity (later wins per field)', () => {
    const { entries: map } = entries(
      '{"tags":{"Product-Design":{"icon":"🅰️","favorite":true},"product_design":{"icon":"🅱️"}}}'
    );

    expect([...map.keys()]).toEqual(['product design']);
    expect(map.get('product design')).toEqual({ icon: '🅱️', favorite: true });
  });

  it('drops invalid entries and fields with a warning but keeps the valid ones', () => {
    const parsed = entries(
      '{"tags":{"good":{"icon":"✅"},"bad":"nope","worse":[],"mixed":{"icon":5,"favorite":"yes","name":""},"":{}}}'
    );

    expect([...parsed.entries.keys()].sort()).toEqual(['good', 'mixed']);
    expect(parsed.entries.get('mixed')).toEqual({});
    expect(parsed.warnings.length).toBeGreaterThanOrEqual(5);
  });

  it('keeps fields it does not know (forward compatibility, e.g. a future color)', () => {
    const { entries: map } = entries('{"tags":{"design":{"icon":"🎨","color":"purple"}}}');

    expect(map.get('design')).toEqual({ icon: '🎨', color: 'purple' });
  });

  it('reports malformed JSON and wrong shapes as not ok', () => {
    expect(parseTagMetadataFile('{"tags":').ok).toBe(false);
    expect(parseTagMetadataFile('[]').ok).toBe(false);
    expect(parseTagMetadataFile('"text"').ok).toBe(false);
    expect(parseTagMetadataFile('{"tags":[]}').ok).toBe(false);
    expect(parseTagMetadataFile('{"tags":"x"}').ok).toBe(false);
  });
});

describe('serializeTagMetadataFile', () => {
  it('is deterministic: sorted keys, fixed field order, version, trailing newline', () => {
    const text = serializeTagMetadataFile(
      new Map([
        ['zeta', { favorite: true, icon: 'z', name: 'Zeta' }],
        ['alpha', {}],
      ])
    );

    expect(text).toBe(
      [
        '{',
        '  "version": 2,',
        '  "tags": {',
        '    "alpha": {},',
        '    "zeta": {',
        '      "name": "Zeta",',
        '      "icon": "z",',
        '      "favorite": true',
        '    }',
        '  }',
        '}',
        '',
      ].join('\n')
    );
  });

  it('does not write the default favorite: false', () => {
    expect(serializeTagMetadataFile(new Map([['a', { favorite: false }]]))).not.toContain('favorite');
  });

  it('round-trips unknown fields', () => {
    const source = new Map([['design', { icon: '🎨', color: 'purple' } as never]]);
    const reparsed = entries(serializeTagMetadataFile(source));

    expect(reparsed.entries.get('design')).toEqual({ icon: '🎨', color: 'purple' });
  });

  it('is stable: serialize(parse(serialize(x))) === serialize(x)', () => {
    const once = serializeTagMetadataFile(new Map([['b', { icon: '2' }], ['a', {}]]));

    expect(serializeTagMetadataFile(entries(once).entries)).toBe(once);
  });
});
