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
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
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
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
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

describe('createWikiLinkSuggester — nothing to create inside the Daily Notes folder', () => {
  it('offers no Create option for a path inside the Daily Notes folder', () => {
    const vault = makeVault([]);
    const suggest = createWikiLinkSuggester(vault, fakePageOperations(), fakeFolderOperations());

    expect(suggest('Daily Notes/2026/October/Foo')).toEqual([]);
    expect(suggest('Daily Notes/Foo')).toEqual([]);
    expect(suggest('daily notes/2099/March/Foo')).toEqual([]);
  });

  it('still offers Create for any other unmatched path, including look-alikes', () => {
    const vault = makeVault([]);
    const suggest = createWikiLinkSuggester(vault, fakePageOperations(), fakeFolderOperations());

    for (const path of ['Projects/Foo', 'Daily Notes Archive/Foo', 'Projects/Daily Notes/Foo']) {
      expect(suggest(path)).toEqual([expect.objectContaining({ kind: 'create', path })]);
    }
  });

  it('still lists the Daily Notes that exist, so linking to one works', () => {
    const page = makePage({ id: 'd1', path: '/vault/Daily Notes/2026/October/2026-10-03.md', name: '2026-10-03' });
    const vault = makeVault([page]);
    const suggest = createWikiLinkSuggester(vault, fakePageOperations(), fakeFolderOperations());

    expect(suggest('2026-10')).toEqual([expect.objectContaining({ kind: 'page', title: '2026-10-03' })]);
  });
});

describe('createWikiLinkSuggester', () => {
  it('returns nothing for an empty query when the vault has no pages', () => {
    const vault = makeVault([]);
    const suggest = createWikiLinkSuggester(vault, fakePageOperations(), fakeFolderOperations());

    expect(suggest('')).toEqual([]);
    expect(suggest('   ')).toEqual([]);
  });

  it('returns every page for an empty query, so autocomplete can open immediately on a freshly typed [[', () => {
    const pageB = makePage({ id: 'p2', path: '/vault/Beta.md', name: 'Beta' });
    const pageA = makePage({ id: 'p1', path: '/vault/Alpha.md', name: 'Alpha' });
    const vault = makeVault([pageB, pageA]);
    const suggest = createWikiLinkSuggester(vault, fakePageOperations(), fakeFolderOperations());

    const results = suggest('');

    expect(results).toEqual([
      { kind: 'page', path: 'Alpha', title: 'Alpha', breadcrumb: null },
      { kind: 'page', path: 'Beta', title: 'Beta', breadcrumb: null },
    ]);
  });

  it('an empty (whitespace-only) query is treated the same as a truly empty one — every page, no Create option', () => {
    const page = makePage({ id: 'p1', path: '/vault/Alpha.md', name: 'Alpha' });
    const vault = makeVault([page]);
    const suggest = createWikiLinkSuggester(vault, fakePageOperations(), fakeFolderOperations());

    const results = suggest('   ');

    expect(results).toEqual([{ kind: 'page', path: 'Alpha', title: 'Alpha', breadcrumb: null }]);
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

  it('a page found by an alias carries that alias; a title match carries none', () => {
    const withAliases = (id: string, path: string, name: string, aliases: string[]) =>
      makePage({
        id,
        path,
        name,
        analysis: {
          headings: [],
          aliases: aliases.map((value) => ({ value })),
          blockReferences: [],
          tasks: [],
          tags: [],
          links: [],
          embeds: [],
        },
      });
    const guidelines = withAliases(
      'p1',
      '/vault/Design/User Experience Guidelines.md',
      'User Experience Guidelines',
      ['UX writing', 'UX']
    );
    const research = withAliases('p2', '/vault/UX Research.md', 'UX Research', []);
    const suggest = createWikiLinkSuggester(
      makeVault([guidelines, research]),
      fakePageOperations(),
      fakeFolderOperations()
    );

    expect(suggest('UX')).toEqual([
      {
        kind: 'page',
        path: 'Design/User Experience Guidelines',
        title: 'User Experience Guidelines',
        breadcrumb: 'Design',
        // The exact alias, not the first one that merely contains the query.
        alias: 'UX',
      },
      { kind: 'page', path: 'UX Research', title: 'UX Research', breadcrumb: null },
    ]);
  });

  it('shows every page sharing an alias — aliases are not unique', () => {
    const shared = (id: string, path: string, name: string) =>
      makePage({
        id,
        path,
        name,
        analysis: {
          headings: [],
          aliases: [{ value: 'Spec' }],
          blockReferences: [],
          tasks: [],
          tags: [],
          links: [],
          embeds: [],
        },
      });
    const suggest = createWikiLinkSuggester(
      makeVault([shared('p1', '/vault/A/One.md', 'One'), shared('p2', '/vault/B/Two.md', 'Two')]),
      fakePageOperations(),
      fakeFolderOperations()
    );

    expect(suggest('spec').map((r) => (r.kind === 'page' ? [r.path, r.alias] : r.path))).toEqual([
      ['A/One', 'Spec'],
      ['B/Two', 'Spec'],
    ]);
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

describe('createWikiLinkSuggester — what the popup row needs', () => {
  it('flags a Daily Note, and carries a note\'s own emoji, on its page suggestion', () => {
    const vault = makeVault([
      makePage({ id: 'a', path: '/vault/Alpha.md', name: 'Alpha', metadata: { ...defaultPageMetadata, icon: '🚀' } }),
      makePage({ id: 'd', path: '/vault/Daily Notes/2026/October/2026-10-04.md', name: '2026-10-04', type: 'daily-note' }),
      makePage({ id: 'b', path: '/vault/Beta.md', name: 'Beta' }),
    ]);
    const suggest = createWikiLinkSuggester(vault, fakePageOperations(), fakeFolderOperations());

    const byTitle = new Map(suggest('').map((s) => [s.kind === 'page' ? s.title : '', s]));
    expect(byTitle.get('Alpha')).toMatchObject({ emoji: '🚀' });
    expect(byTitle.get('Alpha')).not.toHaveProperty('dailyNote');
    expect(byTitle.get('2026-10-04')).toMatchObject({ dailyNote: true });
    expect(byTitle.get('Beta')).not.toHaveProperty('emoji');
    expect(byTitle.get('Beta')).not.toHaveProperty('dailyNote');
  });
});

describe('createWikiLinkSuggester — Daily Notes are found by their date', () => {
  const dailyPath = (iso: string, month: string) => `/vault/Daily Notes/${iso.slice(0, 4)}/${month}/${iso}.md`;
  const daily = (iso: string, month: string, overrides: Partial<Page> = {}) =>
    makePage({ id: `d-${iso}`, path: dailyPath(iso, month), name: iso, type: 'daily-note', ...overrides });

  const vault = () =>
    makeVault([
      daily('2020-08-24', 'August'),
      daily('2020-08-25', 'August'),
      daily('2020-09-24', 'September'),
      makePage({ id: 'n1', path: '/vault/Notes about August.md', name: 'Notes about August' }),
    ]);
  const suggest = (v: Vault, query: string) =>
    createWikiLinkSuggester(v, fakePageOperations(), fakeFolderOperations())(query)
      .flatMap((s) => (s.kind === 'page' ? [s.title] : []))
      .sort();

  it('still finds a note by its ISO date', () => {
    expect(suggest(vault(), '2020-08-24')).toEqual(['2020-08-24']);
  });

  it('finds every August Daily Note — and the note whose title says August — by "Aug"', () => {
    expect(suggest(vault(), 'Aug')).toEqual(['2020-08-24', '2020-08-25', 'Notes about August']);
  });

  it('finds the September note by "Sep"', () => {
    expect(suggest(vault(), 'Sep')).toEqual(['2020-09-24']);
  });

  it('finds one day by "Aug 24", "24 Aug", "August 24, 2020" and its weekday', () => {
    for (const query of ['Aug 24', '24 Aug', 'August 24, 2020', 'Monday 24']) {
      expect(suggest(vault(), query)).toEqual(['2020-08-24']);
    }
  });

  it('does not find a Daily Note by a date it is not', () => {
    expect(suggest(vault(), 'Aug 26')).toEqual([]);
  });

  it('flags the suggestion as a Daily Note, so the popup shows the app\'s date title and the Daily notes section', () => {
    const [suggestion] = createWikiLinkSuggester(vault(), fakePageOperations(), fakeFolderOperations())('Aug 24');

    expect(suggestion).toMatchObject({ kind: 'page', dailyNote: true });
  });

  it('still points at the canonical page: the path inserted is the stored one, never the date alias', () => {
    const [suggestion] = createWikiLinkSuggester(vault(), fakePageOperations(), fakeFolderOperations())('Aug 24');

    expect(suggestion).toMatchObject({ path: 'Daily Notes/2020/August/2020-08-24', title: '2020-08-24' });
    expect(suggestion).not.toHaveProperty('alias');
  });

  describe('archived pages', () => {
    const archived = (page: Page): Page => ({ ...page, metadata: { ...page.metadata, status: 'archived' } });
    const isArchived = (page: Page) => page.metadata.status === 'archived';
    const suggestWith = (v: Vault, query: string) =>
      createWikiLinkSuggester(v, fakePageOperations(), fakeFolderOperations(), isArchived)(query)
        .flatMap((s) => (s.kind === 'page' ? [s.title] : []))
        .sort();

    it('are not offered, a Daily Note or an ordinary note — empty query or searched', () => {
      const v = makeVault([
        archived(makePage({ id: 'a1', path: '/vault/Archive/2020-08-24.md', name: '2020-08-24' })),
        archived(makePage({ id: 'a2', path: '/vault/Archive/Old plans.md', name: 'Old plans' })),
        makePage({ id: 'n1', path: '/vault/Plans.md', name: 'Plans' }),
      ]);

      expect(suggestWith(v, '')).toEqual(['Plans']);
      expect(suggestWith(v, 'plans')).toEqual(['Plans']);
      expect(suggestWith(v, '2020-08-24')).toEqual([]);
    });

    it('a page the rule does not call archived is still offered', () => {
      const v = makeVault([daily('2020-08-24', 'August')]);

      expect(suggestWith(v, 'Aug 24')).toEqual(['2020-08-24']);
    });

    it('without a rule passed, the vault\'s own effectively-archived rule applies', () => {
      const v = makeVault([archived(makePage({ id: 'a2', path: '/vault/Archive/Old plans.md', name: 'Old plans' }))]);

      expect(suggest(v, 'old')).toEqual([]);
    });
  });

  it('a note merely named like a date, never a Daily Note, is not given date aliases', () => {
    const lookalike = makePage({ id: 'x', path: '/vault/Projects/2020-08-24.md', name: '2020-08-24' });

    expect(suggest(makeVault([lookalike]), 'Aug 24')).toEqual([]);
    expect(suggest(makeVault([lookalike]), '2020-08-24')).toEqual(['2020-08-24']);
  });
});
