import { describe, expect, it, vi } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { Page } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';
import type { CreatePageOptions, PageOperations } from '@core/application/page/PageOperations';

import { createWikiLinkResolver } from './resolveWikiLink';

function makeVault(pages: Page[], folders: Folder[] = []): Vault {
  return new Vault(
    '/vault',
    pages,
    folders,
    new TagBuilder().build(pages),
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
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

function fakePageOperations(options: {
  open?: (id: string) => void;
  create?: (options: CreatePageOptions) => void;
} = {}): PageOperations {
  return {
    open: (id: string) => {
      options.open?.(id);
      return Promise.resolve();
    },
    create: (createOptions: CreatePageOptions) => {
      options.create?.(createOptions);
      return Promise.resolve('created-page-id');
    },
  } as unknown as PageOperations;
}

describe('createWikiLinkResolver', () => {
  it('resolves a literal vault-relative path (no extension) to the target page', () => {
    const page = makePage({ id: 'p1', path: '/vault/Projects/Page.md', name: 'Page' });
    const vault = makeVault([page]);
    const resolve = createWikiLinkResolver(vault, fakePageOperations());

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
    const resolve = createWikiLinkResolver(vault, fakePageOperations());

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
    const resolve = createWikiLinkResolver(vault, fakePageOperations());

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
    const resolve = createWikiLinkResolver(vault, fakePageOperations());

    expect(resolve('Dup', null).status).toBe('ambiguous');
  });

  it('returns unresolved when nothing matches by path or alias', () => {
    const vault = makeVault([]);
    const resolve = createWikiLinkResolver(vault, fakePageOperations());

    const resolution = resolve('Missing/Page', null);

    expect(resolution.status).toBe('unresolved');
    expect(resolution.displayLabel).toBe('Missing/Page');
  });

  // Requirement 1: resolved WikiLink -> existing page opens. Resolved
  // behavior is unchanged by the unresolved-activation work below.
  it('activate() opens the resolved page through PageOperations.open, and never creates', () => {
    const page = makePage({ id: 'p1', path: '/vault/Page.md', name: 'Page' });
    const vault = makeVault([page]);
    const open = vi.fn();
    const create = vi.fn();
    const resolve = createWikiLinkResolver(vault, fakePageOperations({ open, create }));

    resolve('Page', null).activate();

    expect(open).toHaveBeenCalledWith('p1');
    expect(create).not.toHaveBeenCalled();
  });

  // Requirement 2: unresolved WikiLink -> the page is created (preserving
  // the referenced path/name), then the newly created page opens.
  // PageOperations.create() already opens what it creates (see its own
  // implementation), so there is no separate open() call to make here —
  // asserting the create() call is what "then opens" reduces to.
  describe('activate() on an unresolved WikiLink', () => {
    it('creates the page via PageOperations.create(), preserving the bare name as the title, at the vault root', () => {
      const vault = makeVault([]);
      const create = vi.fn();
      const resolve = createWikiLinkResolver(vault, fakePageOperations({ create }));

      resolve('Does Not Exist', null).activate();

      expect(create).toHaveBeenCalledWith({ folderId: null, title: 'Does Not Exist' });
    });

    it('preserves the target folder when the referenced path has a directory component matching an existing folder', () => {
      const projects = makeFolder({ id: 'folder-1', path: '/vault/Projects' });
      const vault = makeVault([], [projects]);
      const create = vi.fn();
      const resolve = createWikiLinkResolver(vault, fakePageOperations({ create }));

      resolve('Projects/New Page', null).activate();

      expect(create).toHaveBeenCalledWith({ folderId: 'folder-1', title: 'New Page' });
    });

    it('falls back to the vault root when the referenced directory does not exist as a folder (never auto-creates one)', () => {
      const vault = makeVault([]);
      const create = vi.fn();
      const resolve = createWikiLinkResolver(vault, fakePageOperations({ create }));

      resolve('Projects/New Page', null).activate();

      expect(create).toHaveBeenCalledWith({ folderId: null, title: 'New Page' });
    });

    it('never calls PageOperations.open directly — create() already opens what it creates', () => {
      const vault = makeVault([]);
      const open = vi.fn();
      const resolve = createWikiLinkResolver(vault, fakePageOperations({ open }));

      resolve('Does Not Exist', null).activate();

      expect(open).not.toHaveBeenCalled();
    });
  });

  // Requirement 3: ambiguous WikiLink -> no silent create or open.
  it('activate() on an ambiguous WikiLink never creates or opens anything', () => {
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
    const open = vi.fn();
    const create = vi.fn();
    const resolve = createWikiLinkResolver(vault, fakePageOperations({ open, create }));

    resolve('Dup', null).activate();

    expect(open).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
