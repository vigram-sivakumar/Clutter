import { describe, expect, it, vi } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { Page } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';
import type { CreatePageOptions, PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';

import { createWikiLinkSuggester } from './wikiLinkSuggestions';

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

function fakePageOperations(): PageOperations {
  return {
    open: () => Promise.resolve(),
    create: (_options: CreatePageOptions) => Promise.resolve('new-id'),
  } as unknown as PageOperations;
}

function fakeFolderOperations(): FolderOperations {
  return {
    create: () => Promise.resolve('new-folder-id'),
  } as unknown as FolderOperations;
}

const defaultFolderMetadata = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  status: 'active' as const,
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

function makeFolder(overrides: Partial<Folder> & Pick<Folder, 'id' | 'path'>): Folder {
  return {
    name: overrides.path.split('/').pop() ?? overrides.path,
    parentId: null,
    metadata: defaultFolderMetadata,
    ...overrides,
  };
}

/**
 * Mutates `vault` on "creation", mirroring what the real Gate-backed
 * `PageOperations.create()`/`FolderOperations.create()` do by the time
 * their returned promise resolves — same fakes `resolveWikiLink.test.ts`
 * already uses for the identical reason, duplicated here rather than
 * imported since they're test-only fixtures, not production logic (rule 4
 * governs business-rule duplication, not per-file test scaffolding).
 */
function persistingPageOperations(vault: Vault): PageOperations {
  return {
    open: () => Promise.resolve(),
    create: (createOptions: CreatePageOptions) => {
      const folderPath = createOptions.folderId
        ? (vault.getFolder(createOptions.folderId)?.path ?? vault.root)
        : vault.root;
      const title = createOptions.title ?? 'Untitled';
      const path = `${folderPath}/${title}.md`;
      const id = `page:${path}`;
      vault.addPage(makePage({ id, path, name: title }));
      return Promise.resolve(id);
    },
  } as unknown as PageOperations;
}

function persistingFolderOperations(vault: Vault): FolderOperations {
  return {
    create: (name: string, parentId: string | null) => {
      const parentPath = parentId ? (vault.getFolder(parentId)?.path ?? vault.root) : vault.root;
      const path = `${parentPath}/${name}`;
      const id = `folder:${path}`;
      vault.addFolder(makeFolder({ id, path, parentId }));
      return Promise.resolve(id);
    },
  } as unknown as FolderOperations;
}

describe('createWikiLinkSuggester', () => {
  it('returns nothing for an empty query', () => {
    const vault = makeVault([]);
    const suggest = createWikiLinkSuggester(vault, fakePageOperations(), fakeFolderOperations());

    expect(suggest('')).toEqual([]);
    expect(suggest('   ')).toEqual([]);
  });

  it('matches by case-insensitive title substring', () => {
    const page = makePage({ id: 'p1', path: '/vault/Projects/Project Alpha.md', name: 'Project Alpha' });
    const vault = makeVault([page]);
    const suggest = createWikiLinkSuggester(vault, fakePageOperations(), fakeFolderOperations());

    const results = suggest('alpha');

    expect(results).toEqual([
      { kind: 'page', path: 'Projects/Project Alpha', title: 'Project Alpha', breadcrumb: 'Projects' },
    ]);
  });

  it('matches by alias when the title does not match', () => {
    const page = makePage({
      id: 'p1',
      path: '/vault/Real Title.md',
      name: 'Real Title',
      analysis: {
        headings: [],
        aliases: [{ value: 'Nickname' }],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    });
    const vault = makeVault([page]);
    const suggest = createWikiLinkSuggester(vault, fakePageOperations(), fakeFolderOperations());

    const results = suggest('nick');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: 'page', path: 'Real Title' });
  });

  it('a root-level page has no breadcrumb', () => {
    const page = makePage({ id: 'p1', path: '/vault/Root Page.md', name: 'Root Page' });
    const vault = makeVault([page]);
    const suggest = createWikiLinkSuggester(vault, fakePageOperations(), fakeFolderOperations());

    expect(suggest('root')).toEqual([
      { kind: 'page', path: 'Root Page', title: 'Root Page', breadcrumb: null },
    ]);
  });

  it('orders matches alphabetically, natural sort', () => {
    const pageB = makePage({ id: 'p2', path: '/vault/Project 10.md', name: 'Project 10' });
    const pageA = makePage({ id: 'p1', path: '/vault/Project 2.md', name: 'Project 2' });
    const vault = makeVault([pageB, pageA]);
    const suggest = createWikiLinkSuggester(vault, fakePageOperations(), fakeFolderOperations());

    const results = suggest('project');

    expect(results.map((r) => (r.kind === 'page' ? r.title : r.path))).toEqual(['Project 2', 'Project 10']);
  });

  it('offers a single Create option when nothing matches, never alongside real results', () => {
    const page = makePage({ id: 'p1', path: '/vault/Existing.md', name: 'Existing' });
    const vault = makeVault([page]);
    const suggest = createWikiLinkSuggester(vault, fakePageOperations(), fakeFolderOperations());

    const noMatch = suggest('Totally New Page');
    expect(noMatch).toHaveLength(1);
    expect(noMatch[0]).toMatchObject({ kind: 'create', path: 'Totally New Page' });

    const realMatch = suggest('Existing');
    expect(realMatch.every((r) => r.kind === 'page')).toBe(true);
  });

  it('the Create suggestion\'s create() reuses createReferencedPage — same nested-folder-chain creation as an unresolved WikiLink click, not a second mechanism', async () => {
    const vault = makeVault([]);
    const suggest = createWikiLinkSuggester(vault, persistingPageOperations(vault), persistingFolderOperations(vault));

    const [suggestion] = suggest('Project/Projects/New Note');
    expect(suggestion?.kind).toBe('create');

    if (suggestion?.kind === 'create') {
      suggestion.create();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vault.getFolderByPath('/vault/Project')).toBeDefined();
    expect(vault.getFolderByPath('/vault/Project/Projects')).toBeDefined();
    expect(vault.getPageByPath('/vault/Project/Projects/New Note.md')).toBeDefined();
  });

  // Regression: accepting "+ Create" must only insert/create the WikiLink,
  // never navigate to the newly created page — autocomplete acceptance is
  // insertion-only (docs/editor-architecture-decisions.md). Distinct from
  // an explicit click on an unresolved WikiLink already in the document
  // (resolveWikiLink.test.ts's own "activate() on an unresolved WikiLink"
  // suite), which still creates-and-opens, unchanged.
  it("the Create suggestion's create() persists the page but never opens/navigates to it", async () => {
    const vault = makeVault([]);
    const open = vi.fn();
    const pageOperations: PageOperations = {
      open: (id: string) => {
        open(id);
        return Promise.resolve();
      },
      create: (createOptions: CreatePageOptions) => {
        const title = createOptions.title ?? 'Untitled';
        const path = `/vault/${title}.md`;
        const id = `page:${path}`;
        vault.addPage(makePage({ id, path, name: title }));
        return Promise.resolve(id);
      },
    } as unknown as PageOperations;
    const suggest = createWikiLinkSuggester(vault, pageOperations, fakeFolderOperations());

    const [suggestion] = suggest('New Note');
    expect(suggestion?.kind).toBe('create');

    if (suggestion?.kind === 'create') {
      suggestion.create();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vault.getPageByPath('/vault/New Note.md')).toBeDefined();
    expect(open).not.toHaveBeenCalled();
  });
});
