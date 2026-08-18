import { describe, expect, it, vi } from 'vitest';

import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { TagBuilder } from '@core/vault/knowledge/TagBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import type { Page } from '@core/vault/models/Page';
import type { Folder } from '@core/vault/models/Folder';
import type { CreatePageOptions, PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';

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

/**
 * Both fakes below actually mutate the shared `vault` on "creation",
 * mirroring what the real Gate-backed `PageOperations.create()`/
 * `FolderOperations.create()` do by the time their returned promise
 * resolves (`Vault.addPage`/`Vault.addFolder`). This is what makes the
 * resolver's own re-check-before-create guard (and the "repeated
 * activation" / "already exists" tests below) meaningful — a fake that
 * only records calls without touching `Vault` couldn't distinguish "the
 * resolver checked and found nothing" from "the resolver never checked
 * at all".
 */
function fakePageOperations(
  vault: Vault,
  options: {
    open?: (id: string) => void;
    create?: (options: CreatePageOptions) => void;
  } = {}
): PageOperations {
  return {
    open: (id: string) => {
      options.open?.(id);
      return Promise.resolve();
    },
    create: (createOptions: CreatePageOptions) => {
      options.create?.(createOptions);

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

function fakeFolderOperations(
  vault: Vault,
  options: { create?: (name: string, parentId: string | null) => void } = {}
): FolderOperations {
  return {
    create: (name: string, parentId: string | null) => {
      options.create?.(name, parentId);

      const parentPath = parentId ? (vault.getFolder(parentId)?.path ?? vault.root) : vault.root;
      const path = `${parentPath}/${name}`;
      const id = `folder:${path}`;
      vault.addFolder(makeFolder({ id, path, parentId }));

      return Promise.resolve(id);
    },
  } as unknown as FolderOperations;
}

/**
 * `WikiLinkResolution.activate` is typed `() => void` (locked contract —
 * not changed here), so callers, including these tests, have no promise
 * to await directly. A single macrotask flush reliably drains the whole
 * chained-await sequence inside `createReferencedPage`/`ensureFolderChain`
 * regardless of how many folder levels it walks, since every step in
 * that chain is a microtask (our fakes above resolve synchronously,
 * wrapped in `Promise.resolve()`) and a `setTimeout` callback is only
 * ever run after all currently-pending microtasks have drained.
 */
async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createWikiLinkResolver', () => {
  it('resolves a literal vault-relative path (no extension) to the target page', () => {
    const page = makePage({ id: 'p1', path: '/vault/Projects/Page.md', name: 'Page' });
    const vault = makeVault([page]);
    const resolve = createWikiLinkResolver(vault, fakePageOperations(vault), fakeFolderOperations(vault));

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
    const resolve = createWikiLinkResolver(vault, fakePageOperations(vault), fakeFolderOperations(vault));

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
    const resolve = createWikiLinkResolver(vault, fakePageOperations(vault), fakeFolderOperations(vault));

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
    const resolve = createWikiLinkResolver(vault, fakePageOperations(vault), fakeFolderOperations(vault));

    expect(resolve('Dup', null).status).toBe('ambiguous');
  });

  it('returns unresolved when nothing matches by path or alias', () => {
    const vault = makeVault([]);
    const resolve = createWikiLinkResolver(vault, fakePageOperations(vault), fakeFolderOperations(vault));

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
    const resolve = createWikiLinkResolver(
      vault,
      fakePageOperations(vault, { open, create }),
      fakeFolderOperations(vault)
    );

    resolve('Page', null).activate();

    expect(open).toHaveBeenCalledWith('p1');
    expect(create).not.toHaveBeenCalled();
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
    const resolve = createWikiLinkResolver(
      vault,
      fakePageOperations(vault, { open, create }),
      fakeFolderOperations(vault)
    );

    resolve('Dup', null).activate();

    expect(open).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  // Requirement 2: unresolved WikiLink -> the missing folder hierarchy
  // (if any) is created first, then the note is created at the exact
  // referenced path, then it opens — via the existing
  // PageOperations.create()/FolderOperations.create() flows only.
  describe('activate() on an unresolved WikiLink — full-path create-then-open', () => {
    // 1. Root-level unresolved note.
    it('creates a root-level note when the referenced path has no directory component', async () => {
      const vault = makeVault([]);
      const createPage = vi.fn();
      const createFolder = vi.fn();
      const resolve = createWikiLinkResolver(
        vault,
        fakePageOperations(vault, { create: createPage }),
        fakeFolderOperations(vault, { create: createFolder })
      );

      resolve('Does Not Exist', null).activate();
      await flushAsync();

      expect(createFolder).not.toHaveBeenCalled();
      expect(createPage).toHaveBeenCalledWith({ folderId: null, title: 'Does Not Exist' });
      expect(vault.getPageByPath('/vault/Does Not Exist.md')).toBeDefined();
    });

    // 2. Existing parent folder + missing note.
    it('creates the note directly inside an already-existing parent folder, creating no folder', async () => {
      const projects = makeFolder({ id: 'folder-projects', path: '/vault/Projects' });
      const vault = makeVault([], [projects]);
      const createPage = vi.fn();
      const createFolder = vi.fn();
      const resolve = createWikiLinkResolver(
        vault,
        fakePageOperations(vault, { create: createPage }),
        fakeFolderOperations(vault, { create: createFolder })
      );

      resolve('Projects/New Page', null).activate();
      await flushAsync();

      expect(createFolder).not.toHaveBeenCalled();
      expect(createPage).toHaveBeenCalledWith({ folderId: 'folder-projects', title: 'New Page' });
    });

    // 3. Missing one intermediate folder.
    it('creates a single missing intermediate folder, then the note inside it', async () => {
      const vault = makeVault([]);
      const createPage = vi.fn();
      const createFolder = vi.fn();
      const resolve = createWikiLinkResolver(
        vault,
        fakePageOperations(vault, { create: createPage }),
        fakeFolderOperations(vault, { create: createFolder })
      );

      resolve('Projects/New Page', null).activate();
      await flushAsync();

      expect(createFolder).toHaveBeenCalledTimes(1);
      expect(createFolder).toHaveBeenCalledWith('Projects', null);

      const createdFolder = vault.getFolderByPath('/vault/Projects');
      expect(createdFolder).toBeDefined();
      expect(createPage).toHaveBeenCalledWith({ folderId: createdFolder?.id, title: 'New Page' });
      expect(vault.getPageByPath('/vault/Projects/New Page.md')).toBeDefined();
    });

    // 4. Missing multiple intermediate folders.
    it('creates every missing intermediate folder in order, then the note inside the innermost one', async () => {
      const vault = makeVault([]);
      const createPage = vi.fn();
      const createFolder = vi.fn();
      const resolve = createWikiLinkResolver(
        vault,
        fakePageOperations(vault, { create: createPage }),
        fakeFolderOperations(vault, { create: createFolder })
      );

      resolve('Projects/Project B/Note', null).activate();
      await flushAsync();

      expect(createFolder).toHaveBeenCalledTimes(2);
      expect(createFolder).toHaveBeenNthCalledWith(1, 'Projects', null);

      const projectsFolder = vault.getFolderByPath('/vault/Projects');
      expect(projectsFolder).toBeDefined();
      expect(createFolder).toHaveBeenNthCalledWith(2, 'Project B', projectsFolder?.id);

      const projectBFolder = vault.getFolderByPath('/vault/Projects/Project B');
      expect(projectBFolder).toBeDefined();
      expect(createPage).toHaveBeenCalledWith({ folderId: projectBFolder?.id, title: 'Note' });
      expect(vault.getPageByPath('/vault/Projects/Project B/Note.md')).toBeDefined();
    });

    // 5. Fully existing path -> resolved branch, no create.
    it('never enters the create flow when the referenced path already exists — resolved handles it instead', () => {
      const projects = makeFolder({ id: 'folder-projects', path: '/vault/Projects' });
      const page = makePage({ id: 'p1', path: '/vault/Projects/Existing.md', name: 'Existing' });
      const vault = makeVault([page], [projects]);
      const open = vi.fn();
      const createPage = vi.fn();
      const createFolder = vi.fn();
      const resolve = createWikiLinkResolver(
        vault,
        fakePageOperations(vault, { open, create: createPage }),
        fakeFolderOperations(vault, { create: createFolder })
      );

      const resolution = resolve('Projects/Existing', null);
      expect(resolution.status).toBe('resolved');

      resolution.activate();

      expect(open).toHaveBeenCalledWith('p1');
      expect(createPage).not.toHaveBeenCalled();
      expect(createFolder).not.toHaveBeenCalled();
    });

    // 6. Repeated activation after creation does not create another note
    // (or folder) — the second activation finds the now-existing page in
    // Vault and opens it instead.
    it('does not create a duplicate note or folder on a repeated activation of the same reference', async () => {
      const vault = makeVault([]);
      const open = vi.fn();
      const createPage = vi.fn();
      const createFolder = vi.fn();
      const resolve = createWikiLinkResolver(
        vault,
        fakePageOperations(vault, { open, create: createPage }),
        fakeFolderOperations(vault, { create: createFolder })
      );

      const resolution = resolve('Projects/New Page', null);

      resolution.activate();
      await flushAsync();

      expect(createPage).toHaveBeenCalledTimes(1);
      expect(createFolder).toHaveBeenCalledTimes(1);

      resolution.activate();
      await flushAsync();

      expect(createPage).toHaveBeenCalledTimes(1);
      expect(createFolder).toHaveBeenCalledTimes(1);

      const created = vault.getPageByPath('/vault/Projects/New Page.md');
      expect(created).toBeDefined();
      expect(open).toHaveBeenCalledWith(created?.id);
    });

    it('does not use the local alias as the created note title', async () => {
      const vault = makeVault([]);
      const createPage = vi.fn();
      const resolve = createWikiLinkResolver(
        vault,
        fakePageOperations(vault, { create: createPage }),
        fakeFolderOperations(vault)
      );

      resolve('Does Not Exist', 'A Friendly Alias').activate();
      await flushAsync();

      expect(createPage).toHaveBeenCalledWith({ folderId: null, title: 'Does Not Exist' });
    });
  });
});
