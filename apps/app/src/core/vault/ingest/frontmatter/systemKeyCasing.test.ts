import { describe, expect, it } from 'vitest';

import { FrontmatterParser } from '../FrontmatterParser';
import { FrontmatterSerializer } from '../FrontmatterSerializer';
import { PageBuilder } from '../PageBuilder';
import { readCustomProperties, validateCustomPropertyName } from './customFrontmatter';
import { matchSystemKey } from './ownedFrontmatterKeys';

const parser = new FrontmatterParser();

function buildPage(yaml: string) {
  const parsed = parser.parse(`---\nid: p1\n${yaml}\n---\nbody`);
  return new PageBuilder().build({
    parentId: null,
    page: {
      path: '/v/Note.md',
      directoryPath: '/v',
      frontmatter: parsed.frontmatter,
      frontmatterAnalysis: parsed.frontmatterAnalysis,
      content: parsed.body,
      analysis: parsed.analysis,
    },
  });
}

describe('matchSystemKey — exact, case-insensitive', () => {
  it.each([
    ['aliases', 'aliases'],
    ['Aliases', 'aliases'],
    ['ALIASES', 'aliases'],
    ['aLiAsEs', 'aliases'],
    [' Tags ', 'tags'],
    ['created', 'created'],
    ['Created', 'created'],
    ['CREATED', 'created'],
    ['coverlayout', 'coverLayout'],
    ['type', 'type'],
  ])('%j → %s', (raw, canonical) => {
    expect(matchSystemKey(raw)).toBe(canonical);
  });

  it.each(['Date Created', 'Creation Date', 'Created Date', 'Alias', 'tag', 'lastEdited', 'Type', 'TYPE'])(
    '%j is not a system key',
    (raw) => {
      expect(matchSystemKey(raw)).toBeNull();
    }
  );
});

describe('differently-cased system keys in the file', () => {
  it.each(['aliases', 'Aliases', 'ALIASES', 'aLiAsEs'])(
    '%s: is the system aliases property, in link resolution, and never a custom property',
    (key) => {
      const page = buildPage(`${key}:\n  - UX\n  - Design System`);

      expect(page.metadata.aliases).toEqual(['UX', 'Design System']);
      expect(page.analysis.aliases.map((alias) => alias.value)).toEqual(['UX', 'Design System']);
      expect(page.metadata.unownedFrontmatter).toBeUndefined();
      expect(readCustomProperties(page.metadata.unownedFrontmatter ?? [])).toEqual([]);
    }
  );

  it.each(['created', 'Created', 'CREATED'])('%s: is the system created property', (key) => {
    const page = buildPage(`${key}: 2026-01-02T03:04:05.000Z`);

    expect(page.metadata.createdAt).toBe('2026-01-02T03:04:05.000Z');
    expect(page.metadata.unownedFrontmatter).toBeUndefined();
  });

  it('similar-but-not-identical names stay custom properties, as written', () => {
    const page = buildPage('Date Created: 2026-01-01\nCreation Date: 2026-01-02\nCreated Date: x\nAlias: UX');

    expect(readCustomProperties(page.metadata.unownedFrontmatter ?? []).map((p) => p.key)).toEqual([
      'Date Created',
      'Creation Date',
      'Created Date',
      'Alias',
    ]);
    expect(page.metadata.aliases).toEqual([]);
    expect(page.metadata.createdAt).toBeNull();
  });

  it("a user's own `Type:` stays a preserved custom key — only the retired exact `type` is dropped", () => {
    const page = buildPage('Type: book');
    expect(readCustomProperties(page.metadata.unownedFrontmatter ?? [])).toEqual([
      { key: 'Type', type: 'text', value: 'book' },
    ]);
  });

  it('a save keeps the file’s own spelling of each recognized key, recording only the ones that differ', () => {
    const page = buildPage('Aliases:\n  - UX\nFavorite: true\nTAGS:\n  - work\ndescription: d');

    expect(page.metadata.frontmatterKeySpellings).toEqual({
      aliases: 'Aliases',
      favorite: 'Favorite',
      tags: 'TAGS',
    });

    const saved = new FrontmatterSerializer().serializeDocument(page, 'body');
    expect(saved).toContain('Aliases:\n  - UX');
    expect(saved).toContain('Favorite: true');
    expect(saved).toContain('TAGS:\n  - work');
    expect(saved).toContain('description: d');
    expect(saved).not.toMatch(/^aliases:|^favorite:|^tags:/m);
  });
});

describe('reserved custom-property names stay case-insensitive', () => {
  it.each(['tags', 'Tags', 'TAGS', 'aliases', 'Aliases', 'ALIASES', 'aLiAsEs', 'created', 'Created', 'CREATED'])(
    'renaming a custom property to %j is rejected',
    (name) => {
      expect(validateCustomPropertyName(['priority: high'], 'priority', name)).toBe('reserved');
    }
  );

  it('similar names are allowed', () => {
    expect(validateCustomPropertyName(['priority: high'], 'priority', 'Date Created')).toBeNull();
  });
});
