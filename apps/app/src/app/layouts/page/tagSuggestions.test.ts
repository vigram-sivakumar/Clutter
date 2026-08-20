import { describe, expect, it } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { Page } from '@core/vault/models/Page';

import { createTagSuggester } from './tagSuggestions';

const defaultPageMetadata = {
  icon: null,
  cover: null,
  description: '',
  favorite: false,
  status: 'active' as const,
  archivedAt: null,
  originalParentId: null,
  originalPath: null,
  createdAt: null,
  updatedAt: null,
};

function makePage(id: string, tagNames: readonly string[]): Page {
  return {
    id,
    type: 'note',
    name: id,
    path: `/vault/${id}.md`,
    parentId: null,
    metadata: defaultPageMetadata,
    source: { markdown: '' },
    analysis: {
      headings: [],
      aliases: [],
      blockReferences: [],
      tasks: [],
      tags: tagNames.map((name) => ({ name, sourcePageId: id })),
      links: [],
      embeds: [],
    },
  };
}

function makeVault(pages: Page[]): Vault {
  return new Vault(
    '/vault',
    pages,
    [],
    new TagBuilder().build(pages),
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

describe('createTagSuggester', () => {
  it('returns nothing for an empty query', () => {
    const vault = makeVault([]);
    const suggest = createTagSuggester(vault);

    expect(suggest('')).toEqual([]);
    expect(suggest('   ')).toEqual([]);
  });

  it('matches by case-insensitive substring against a single-word tag', () => {
    const vault = makeVault([makePage('a', ['project'])]);
    const suggest = createTagSuggester(vault);

    expect(suggest('proj')).toEqual(['project']);
    expect(suggest('PROJ')).toEqual(['project']);
  });

  it('returns no suggestions when nothing matches', () => {
    const vault = makeVault([makePage('a', ['project'])]);
    const suggest = createTagSuggester(vault);

    expect(suggest('zzz')).toEqual([]);
  });

  it('multiple separator/case variants of the same logical tag produce exactly ONE suggestion, using the preferred display label', () => {
    // Page "a" (processed first) establishes "Product-design" as the
    // preferred casing/separator; later pages use different casing and
    // separators for the identical logical tag.
    const vault = makeVault([
      makePage('a', ['Product-design']),
      makePage('b', ['product_design']),
      makePage('c', ['PRODUCT-DESIGN']),
    ]);
    const suggest = createTagSuggester(vault);

    expect(suggest('design')).toEqual(['Product design']);
  });

  it('matching operates on normalized identity — a query using a different separator than the stored tag still matches', () => {
    const vault = makeVault([makePage('a', ['Product-design'])]);
    const suggest = createTagSuggester(vault);

    // Typed query uses "_", the vault's preferred spelling uses "-".
    expect(suggest('product_design')).toEqual(['Product design']);
  });

  it('the display label always renders the separator as a space, never the raw hyphen/underscore', () => {
    const vault = makeVault([makePage('a', ['product_design'])]);
    const suggest = createTagSuggester(vault);

    expect(suggest('design')).toEqual(['product design']);
  });

  it('orders matches alphabetically, case-insensitively', () => {
    const vault = makeVault([
      makePage('a', ['travel']),
      makePage('b', ['Architecture']),
    ]);
    const suggest = createTagSuggester(vault);

    expect(suggest('a')).toEqual(['Architecture', 'travel']);
  });

  it('a tag with no separator is unaffected — matches and displays exactly as before', () => {
    const vault = makeVault([makePage('a', ['project'])]);
    const suggest = createTagSuggester(vault);

    expect(suggest('project')).toEqual(['project']);
  });
});
