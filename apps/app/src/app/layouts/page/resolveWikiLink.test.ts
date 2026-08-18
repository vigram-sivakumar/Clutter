import { describe, expect, it, vi } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { Page } from '@core/vault/models/Page';
import type { PageOperations } from '@core/application/page/PageOperations';

import { createWikiLinkResolver } from './resolveWikiLink';

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

function fakePageOperations(open: (id: string) => void): PageOperations {
  return { open: (id: string) => { open(id); return Promise.resolve(); } } as unknown as PageOperations;
}

describe('createWikiLinkResolver', () => {
  it('resolves a literal vault-relative path (no extension) to the target page', () => {
    const page = makePage({ id: 'p1', path: '/vault/Projects/Page.md', name: 'Page' });
    const vault = makeVault([page]);
    const resolve = createWikiLinkResolver(vault, fakePageOperations(vi.fn()));

    const resolution = resolve('Projects/Page', null);

    expect(resolution.status).toBe('resolved');
    expect(resolution.displayLabel).toBe('Page');
  });

  it('display label precedence: local alias > primary frontmatter alias > filename', () => {
    const page = makePage({
      id: 'p1',
      path: '/vault/Page.md',
      name: 'Page',
      analysis: { headings: [], aliases: [{ value: 'Primary Alias' }], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    });
    const vault = makeVault([page]);
    const resolve = createWikiLinkResolver(vault, fakePageOperations(vi.fn()));

    expect(resolve('Page', 'Local Alias').displayLabel).toBe('Local Alias');
    expect(resolve('Page', null).displayLabel).toBe('Primary Alias');
  });

  it('falls back to alias-based resolution only after a literal path match fails', () => {
    const page = makePage({
      id: 'p1',
      path: '/vault/Real/Path.md',
      name: 'Path',
      analysis: { headings: [], aliases: [{ value: 'Alpha' }], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    });
    const vault = makeVault([page]);
    const resolve = createWikiLinkResolver(vault, fakePageOperations(vi.fn()));

    const resolution = resolve('Alpha', null);

    expect(resolution.status).toBe('resolved');
    expect(resolution.displayLabel).toBe('Alpha');
  });

  it('returns ambiguous, never a silent pick, when multiple pages share an alias', () => {
    const pageA = makePage({
      id: 'p1',
      path: '/vault/A.md',
      name: 'A',
      analysis: { headings: [], aliases: [{ value: 'Dup' }], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    });
    const pageB = makePage({
      id: 'p2',
      path: '/vault/B.md',
      name: 'B',
      analysis: { headings: [], aliases: [{ value: 'Dup' }], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    });
    const vault = makeVault([pageA, pageB]);
    const resolve = createWikiLinkResolver(vault, fakePageOperations(vi.fn()));

    expect(resolve('Dup', null).status).toBe('ambiguous');
  });

  it('returns unresolved when nothing matches by path or alias', () => {
    const vault = makeVault([]);
    const resolve = createWikiLinkResolver(vault, fakePageOperations(vi.fn()));

    const resolution = resolve('Missing/Page', null);

    expect(resolution.status).toBe('unresolved');
    expect(resolution.displayLabel).toBe('Missing/Page');
  });

  it('activate() opens the resolved page through PageOperations.open', () => {
    const page = makePage({ id: 'p1', path: '/vault/Page.md', name: 'Page' });
    const vault = makeVault([page]);
    const open = vi.fn();
    const resolve = createWikiLinkResolver(vault, fakePageOperations(open));

    resolve('Page', null).activate();

    expect(open).toHaveBeenCalledWith('p1');
  });
});
