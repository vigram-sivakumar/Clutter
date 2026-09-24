import { describe, expect, it } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { Page } from '@core/vault/models/Page';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';

import { createEmbedHeadingSuggester } from './headingSuggestions';

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

const defaultPageMetadata = {
  icon: null,
  cover: null,
  coverHidden: false,
  description: '',
  favorite: false,
  status: 'active' as const,
  archivedAt: null,
  originalParentId: null,
  originalPath: null,
  createdAt: null,
  updatedAt: null,
};

function makePage(overrides: Partial<Page> & Pick<Page, 'id' | 'path' | 'name'>): Page {
  return {
    type: 'note',
    parentId: null,
    metadata: defaultPageMetadata,
    source: { markdown: '' },
    analysis: { headings: [], aliases: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    ...overrides,
  };
}

function makeEffectivePageState(getPage: (id: string) => { name: string; markdown: string } | undefined): EffectivePageState {
  return { getPage } as unknown as EffectivePageState;
}

describe('createEmbedHeadingSuggester', () => {
  const markdown = ['# Root causes', 'text', '', '## Setup', 'more text', '', '# Appendix', 'end'].join('\n');

  it('returns every heading in document order for an empty query', () => {
    const page = makePage({ id: 'p1', path: '/vault/Note B.md', name: 'Note B', source: { markdown } });
    const vault = makeVault([page]);
    const suggest = createEmbedHeadingSuggester(vault, makeEffectivePageState(() => undefined));

    expect(suggest('Note B', '')).toEqual([
      { kind: 'heading', heading: 'Root causes', level: 1 },
      { kind: 'heading', heading: 'Setup', level: 2 },
      { kind: 'heading', heading: 'Appendix', level: 1 },
    ]);
  });

  it('filters by case-insensitive substring, unlike resolution-time exact matching', () => {
    const page = makePage({ id: 'p1', path: '/vault/Note B.md', name: 'Note B', source: { markdown } });
    const vault = makeVault([page]);
    const suggest = createEmbedHeadingSuggester(vault, makeEffectivePageState(() => undefined));

    expect(suggest('Note B', 'roo')).toEqual([{ kind: 'heading', heading: 'Root causes', level: 1 }]);
  });

  it('scopes suggestions to only the resolved page, never a vault-wide heading search', () => {
    const pageA = makePage({ id: 'a', path: '/vault/A.md', name: 'A', source: { markdown: '# Only in A' } });
    const pageB = makePage({ id: 'b', path: '/vault/B.md', name: 'B', source: { markdown: '# Only in B' } });
    const vault = makeVault([pageA, pageB]);
    const suggest = createEmbedHeadingSuggester(vault, makeEffectivePageState(() => undefined));

    expect(suggest('A', '')).toEqual([{ kind: 'heading', heading: 'Only in A', level: 1 }]);
  });

  it('returns headings from the effective (live) markdown, not the durable copy', () => {
    const page = makePage({ id: 'p1', path: '/vault/Note B.md', name: 'Note B', source: { markdown: '# Old Heading' } });
    const vault = makeVault([page]);
    const suggest = createEmbedHeadingSuggester(
      vault,
      makeEffectivePageState((id) => (id === 'p1' ? { name: 'Note B', markdown: '# New Heading' } : undefined))
    );

    expect(suggest('Note B', '')).toEqual([{ kind: 'heading', heading: 'New Heading', level: 1 }]);
  });

  it('returns no suggestions when the page portion does not resolve', () => {
    const vault = makeVault([]);
    const suggest = createEmbedHeadingSuggester(vault, makeEffectivePageState(() => undefined));

    expect(suggest('Nonexistent', '')).toEqual([]);
  });

  it('returns no suggestions when the page portion is ambiguous (more than one alias match)', () => {
    const alias = [{ value: 'Shared' }];
    const p1 = makePage({ id: 'p1', path: '/vault/A.md', name: 'A', analysis: { headings: [], aliases: alias, blockReferences: [], tasks: [], tags: [], links: [], embeds: [] } });
    const p2 = makePage({ id: 'p2', path: '/vault/B.md', name: 'B', analysis: { headings: [], aliases: alias, blockReferences: [], tasks: [], tags: [], links: [], embeds: [] } });
    const vault = makeVault([p1, p2]);
    const suggest = createEmbedHeadingSuggester(vault, makeEffectivePageState(() => undefined));

    expect(suggest('Shared', '')).toEqual([]);
  });
});
