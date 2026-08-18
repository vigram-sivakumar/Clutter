import { describe, expect, it } from 'vitest';

import { scanWikiLink } from './wikiLinkScanner';
import { serializeWikiLink } from './wikiLinkSerialize';

describe('serializeWikiLink — canonical form', () => {
  it('serializes a bare path with no escaping needed', () => {
    expect(serializeWikiLink('Projects/Project A', null)).toBe('[[Projects/Project A]]');
  });

  it('serializes a path and alias that both contain literal pipes, escaping every occurrence', () => {
    // The worked example from the grammar research.
    const result = serializeWikiLink('Projects/Notes | Ideas', 'Ideas | 2026');
    expect(result).toBe('[[Projects/Notes \\| Ideas|Ideas \\| 2026]]');
  });

  it('escapes every literal ] unconditionally, not only ]]-forming pairs', () => {
    // The boundary case from the corrections addendum: a lone trailing ]
    // with no adjacent ] in the data would still mis-parse if left
    // unescaped, since it can combine with the closer written right after it.
    expect(serializeWikiLink('A]', null)).toBe('[[A\\]]]');
  });

  it('trims incidental leading/trailing whitespace during serialization', () => {
    expect(serializeWikiLink('  Project A  ', null)).toBe('[[Project A]]');
  });
});

describe('round-trip invariants', () => {
  it('parse(serialize(v)) === normalize(v), for an already-normalized value', () => {
    const path = 'Projects/Project A';
    const serialized = serializeWikiLink(path, null);
    const parsed = scanWikiLink(serialized, 0);
    expect(parsed?.path).toBe(path);
    expect(parsed?.alias).toBeNull();
  });

  it('parse(serialize(v)) === normalize(v), not v itself, when v has incidental whitespace', () => {
    // Corrected invariant (docs/editor-research/clutter-editor-wikilink-grammar-corrections.md):
    // the writer trims, so the round trip recovers the *normalized* value,
    // not necessarily the exact original string.
    const rawPath = '  Project A  ';
    const serialized = serializeWikiLink(rawPath, null);
    const parsed = scanWikiLink(serialized, 0);
    expect(parsed?.path).toBe(rawPath.trim());
    expect(parsed?.path).not.toBe(rawPath);
  });

  it('parse(serialize(path, alias)) recovers both segments exactly when both contain literal pipes', () => {
    const path = 'Projects/Notes | Ideas';
    const alias = 'Ideas | 2026';
    const serialized = serializeWikiLink(path, alias);
    const parsed = scanWikiLink(serialized, 0);
    expect(parsed?.path).toBe(path);
    expect(parsed?.alias).toBe(alias);
  });

  it('canonical-serialization stability: re-serializing an already-canonical value does not drift', () => {
    const once = serializeWikiLink('Projects/Notes | Ideas', 'Ideas | 2026');
    const parsed = scanWikiLink(once, 0)!;
    const twice = serializeWikiLink(parsed.path, parsed.alias);
    expect(twice).toBe(once);
  });
});
