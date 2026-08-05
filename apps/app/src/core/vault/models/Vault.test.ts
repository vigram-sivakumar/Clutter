import { describe, expect, it, vi } from 'vitest';
import { Vault } from './Vault';
import { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import { TagBuilder } from '../knowledge/TagBuilder';
import { KnowledgeGraph } from './graph/KnowledgeGraph';
import type { Page } from './Page';
import type { Folder } from './Folder';

function makeVault(pages: Page[], folders: Folder[] = []): Vault {
  // Mirrors VaultBuilder: tags are derived from pages, not hand-supplied,
  // so a fixture page with #tag occurrences in its analysis is reflected
  // in vault.tags()/getTagByName() exactly like a real scan would.
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

const defaultAnalysis = {
  headings: [],
  aliases: [],
  blockReferences: [],
  tasks: [],
  tags: [],
  links: [],
  embeds: [],
};

function makeFolder(overrides: Partial<Folder> & Pick<Folder, 'id' | 'path'>): Folder {
  return {
    name: overrides.path.split('/').pop() ?? '',
    parentId: null,
    metadata: defaultFolderMetadata,
    ...overrides,
  };
}

function makePage(overrides: Partial<Page> & Pick<Page, 'id' | 'path'>): Page {
  return {
    type: 'note',
    name: overrides.path.split('/').pop()?.replace('.md', '') ?? '',
    parentId: null,
    metadata: defaultPageMetadata,
    source: { markdown: '' },
    analysis: defaultAnalysis,
    ...overrides,
  };
}

describe('Vault.setTagMetadata', () => {
  it('enriches tags() and notifies subscribers, without touching pages/folders', () => {
    const page = makePage({ id: 'page-1', path: '/vault/Note.md' });
    const vault = makeVault([
      { ...page, analysis: { ...defaultAnalysis, tags: [{ name: 'project', sourcePageId: 'page-1' }] } },
    ]);

    const listener = vi.fn();
    vault.subscribe(listener);

    expect([...vault.tags()][0]?.icon).toBeUndefined();

    vault.setTagMetadata(new Map([['project', { icon: '📦' }]]));

    expect([...vault.tags()]).toEqual([{ name: 'project', icon: '📦', favorite: false, usageCount: 1 }]);
    expect(listener).toHaveBeenCalledWith({ type: 'tag-metadata-changed' });
  });

  it('a subsequent page mutation keeps the enriched icon', () => {
    const page = makePage({
      id: 'page-1',
      path: '/vault/Note.md',
      analysis: { ...defaultAnalysis, tags: [{ name: 'project', sourcePageId: 'page-1' }] },
    });
    const vault = makeVault([page]);

    vault.setTagMetadata(new Map([['project', { icon: '📦' }]]));

    vault.replacePage({ ...page, analysis: { ...defaultAnalysis, tags: [{ name: 'project', sourcePageId: 'page-1' }] } });

    expect([...vault.tags()]).toEqual([{ name: 'project', icon: '📦', favorite: false, usageCount: 1 }]);
  });

  it('drops a tag from vault.tags() once its last Markdown occurrence is removed, even though its metadata entry still exists — tags.json never manufactures tag existence on its own', () => {
    const page = makePage({
      id: 'page-1',
      path: '/vault/Note.md',
      analysis: { ...defaultAnalysis, tags: [{ name: 'project', sourcePageId: 'page-1' }] },
    });
    const vault = makeVault([page]);

    vault.setTagMetadata(new Map([['project', { icon: '📦' }]]));
    expect([...vault.tags()]).toEqual([{ name: 'project', icon: '📦', favorite: false, usageCount: 1 }]);

    // The tag's only occurrence is edited out of the Markdown — an ordinary
    // page save/rebuild, going through no tag-specific code path.
    vault.replacePage({ ...page, analysis: defaultAnalysis });

    // The metadata entry is still present (setTagMetadata was never called
    // again to remove it) — proving orphaned metadata alone can never
    // resurrect or sustain a Tag once Markdown stops mentioning it.
    expect([...vault.tags()]).toEqual([]);
  });
});

describe('Vault.getTagByName', () => {
  it('finds a tag by its exact stored name — mirrors getPage/getFolder', () => {
    const page = makePage({
      id: 'page-1',
      path: '/vault/Note.md',
      analysis: { ...defaultAnalysis, tags: [{ name: 'Project', sourcePageId: 'page-1' }] },
    });
    const vault = makeVault([page]);

    expect(vault.getTagByName('Project')?.name).toBe('Project');
  });

  it('returns undefined for a name with no matching tag', () => {
    const vault = makeVault([]);

    expect(vault.getTagByName('nonexistent')).toBeUndefined();
  });
});

describe('Vault.isReservedFolder', () => {
  it('returns true for a top-level reserved folder', () => {
    const archive = makeFolder({
      id: 'folder-archive',
      path: '/vault/Archive',
      name: 'Archive',
    });
    const vault = makeVault([], [archive]);

    expect(vault.isReservedFolder(archive)).toBe(true);
  });

  it('returns false for folders nested under a reserved root', () => {
    const dailyNotes = makeFolder({
      id: 'folder-daily-notes',
      path: '/vault/Daily Notes',
      name: 'Daily Notes',
    });
    const monthFolder = makeFolder({
      id: 'folder-2026-01',
      path: '/vault/Daily Notes/2026-01',
      name: '2026-01',
      parentId: 'folder-daily-notes',
    });
    const vault = makeVault([], [dailyNotes, monthFolder]);

    expect(vault.isReservedFolder(dailyNotes)).toBe(true);
    expect(vault.isReservedFolder(monthFolder)).toBe(false);
  });

  it('returns false for user-created folders', () => {
    const projects = makeFolder({
      id: 'folder-projects',
      path: '/vault/Projects',
      name: 'Projects',
    });
    const vault = makeVault([], [projects]);

    expect(vault.isReservedFolder(projects)).toBe(false);
  });
});

describe('Vault.getReservedFolder', () => {
  it('returns a reserved folder by stable identifier', () => {
    const archive = makeFolder({
      id: 'folder-archive',
      path: '/vault/Archive',
      name: 'Archive',
    });
    const vault = makeVault([], [archive]);

    expect(vault.getReservedFolder('archive')).toBe(archive);
  });

  it('returns undefined when the reserved folder is missing', () => {
    const vault = makeVault([], []);

    expect(vault.getReservedFolder('inbox')).toBeUndefined();
  });
});

function makeProjectsHierarchy(): {
  projects: Folder;
  design: Folder;
  notes: Page;
} {
  const projects = makeFolder({
    id: 'folder-projects',
    name: 'Projects',
    path: '/vault/Projects',
    parentId: null,
  });

  const design = makeFolder({
    id: 'folder-design',
    name: 'Design',
    path: '/vault/Projects/Design',
    parentId: 'folder-projects',
  });

  const notes = makePage({
    id: 'page-notes',
    path: '/vault/Projects/Design/Notes.md',
    parentId: 'folder-design',
  });

  return { projects, design, notes };
}

describe('Vault invariants', () => {
  it('finds a folder by its current filesystem path', () => {
    const folder = makeFolder({ id: 'folder-1', path: '/vault/Projects', name: 'Projects' });
    const vault = makeVault([], [folder]);

    const found = vault.getFolderByPath('/vault/Projects');

    expect(found).toBeDefined();
    expect(found!.id).toBe('folder-1');
  });

  it('moves a folder and updates its path lookup', () => {
    const folder = makeFolder({ id: 'folder-1', path: '/vault/Projects', name: 'Projects' });
    const vault = makeVault([], [folder]);

    vault.moveFolder('folder-1', '/vault/NewProjects', null);

    const moved = vault.getFolder('folder-1');

    expect(moved).toBeDefined();
    expect(moved!.path).toBe('/vault/NewProjects');
    expect(moved!.parentId).toBeNull();

    expect(vault.getFolderByPath('/vault/Projects')).toBeUndefined();
    expect(vault.getFolderByPath('/vault/NewProjects')?.id).toBe('folder-1');
  });

  it('emits one folder-moved event when a folder moves', () => {
    const folder = makeFolder({ id: 'folder-1', path: '/vault/Projects', name: 'Projects' });
    const vault = makeVault([], [folder]);
    const events: unknown[] = [];

    vault.subscribe((event) => {
      events.push(event);
    });

    vault.moveFolder('folder-1', '/vault/NewProjects', null);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'folder-moved',
      folderId: 'folder-1',
      path: '/vault/NewProjects',
    });
  });
});

describe('updatePagePath', () => {
  it('updates parentId when a page moves', () => {
    const sourceFolder = makeFolder({
      id: 'folder-source',
      path: '/vault/Source',
      name: 'Source',
    });
    const targetFolder = makeFolder({
      id: 'folder-target',
      path: '/vault/Target',
      name: 'Target',
    });
    const page = makePage({
      id: 'page-1',
      path: '/vault/Source/Note.md',
      parentId: 'folder-source',
    });
    const vault = makeVault([page], [sourceFolder, targetFolder]);

    vault.updatePagePath('page-1', '/vault/Target/Note.md', 'folder-target');

    const moved = vault.getPage('page-1');

    expect(moved!.path).toBe('/vault/Target/Note.md');
    expect(moved!.parentId).toBe('folder-target');
  });

  it('preserves name across a plain move (filename unchanged)', () => {
    const folder = makeFolder({ id: 'folder-target', path: '/vault/Target', name: 'Target' });
    const page = makePage({ id: 'page-1', path: '/vault/Note.md', name: 'Note' });
    const vault = makeVault([page], [folder]);

    vault.updatePagePath('page-1', '/vault/Target/Note.md', 'folder-target');

    expect(vault.getPage('page-1')!.name).toBe('Note');
  });

  it('recomputes name from the new path — the mechanism PageOperations.rename() relies on', () => {
    const page = makePage({ id: 'page-1', path: '/vault/Note.md', name: 'Note' });
    const vault = makeVault([page]);

    vault.updatePagePath('page-1', '/vault/Renamed.md', null);

    const renamed = vault.getPage('page-1')!;
    expect(renamed.name).toBe('Renamed');
    expect(renamed.path).toBe('/vault/Renamed.md');
  });

  it('is a no-op when path and parentId are unchanged', () => {
    const folder = makeFolder({ id: 'folder-1', path: '/vault/Projects', name: 'Projects' });
    const page = makePage({
      id: 'page-1',
      path: '/vault/Projects/Note.md',
      parentId: 'folder-1',
    });
    const vault = makeVault([page], [folder]);
    const events: unknown[] = [];

    vault.subscribe((event) => {
      events.push(event);
    });

    vault.updatePagePath('page-1', '/vault/Projects/Note.md', 'folder-1');

    expect(vault.getPage('page-1')).toBe(page);
    expect(events).toHaveLength(0);
  });

  it('throws for an unknown page', () => {
    const vault = makeVault([]);

    expect(() => {
      vault.updatePagePath('missing', '/vault/Note.md', null);
    }).toThrow('Cannot move unknown page: missing');
  });

  it('throws on path collision', () => {
    const pageA = makePage({ id: 'page-a', path: '/vault/A.md' });
    const pageB = makePage({ id: 'page-b', path: '/vault/B.md' });
    const vault = makeVault([pageA, pageB]);

    expect(() => {
      vault.updatePagePath('page-a', '/vault/B.md', null);
    }).toThrow('Path already in use by another page: /vault/B.md');
  });
});

describe('moveFolder cascade', () => {
  it('updates folder path, child folder path, page path, and page parentId', () => {
    const { projects, design, notes } = makeProjectsHierarchy();
    const vault = makeVault([notes], [projects, design]);

    vault.moveFolder('folder-projects', '/vault/Work', null);

    const movedProjects = vault.getFolder('folder-projects');
    const movedDesign = vault.getFolder('folder-design');
    const movedNotes = vault.getPage('page-notes');

    expect(movedProjects!.path).toBe('/vault/Work');
    expect(movedProjects!.parentId).toBeNull();

    expect(movedDesign!.path).toBe('/vault/Work/Design');
    expect(movedDesign!.parentId).toBe('folder-projects');

    expect(movedNotes!.path).toBe('/vault/Work/Design/Notes.md');
    expect(movedNotes!.parentId).toBe('folder-design');
  });

  it('emits exactly one folder-moved event for a cascade move', () => {
    const { projects, design, notes } = makeProjectsHierarchy();
    const vault = makeVault([notes], [projects, design]);
    const events: unknown[] = [];

    vault.subscribe((event) => {
      events.push(event);
    });

    vault.moveFolder('folder-projects', '/vault/Work', null);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'folder-moved',
      folderId: 'folder-projects',
      path: '/vault/Work',
    });
  });

  it('keeps folder IDs and page IDs unchanged', () => {
    const { projects, design, notes } = makeProjectsHierarchy();
    const vault = makeVault([notes], [projects, design]);

    vault.moveFolder('folder-projects', '/vault/Work', null);

    expect(vault.getFolder('folder-projects')).toBeDefined();
    expect(vault.getFolder('folder-design')).toBeDefined();
    expect(vault.getPage('page-notes')).toBeDefined();
  });

  it('clears old paths and resolves new paths', () => {
    const { projects, design, notes } = makeProjectsHierarchy();
    const vault = makeVault([notes], [projects, design]);

    vault.moveFolder('folder-projects', '/vault/Work', null);

    expect(vault.getFolderByPath('/vault/Projects')).toBeUndefined();
    expect(vault.getFolderByPath('/vault/Projects/Design')).toBeUndefined();
    expect(vault.getPageByPath('/vault/Projects/Design/Notes.md')).toBeUndefined();

    expect(vault.getFolderByPath('/vault/Work')?.id).toBe('folder-projects');
    expect(vault.getFolderByPath('/vault/Work/Design')?.id).toBe('folder-design');
    expect(vault.getPageByPath('/vault/Work/Design/Notes.md')?.id).toBe('page-notes');
  });
});

describe('Vault.getDescendantFoldersAndPages (ADR-024)', () => {
  it('returns every nested folder and page under the given folder', () => {
    const { projects, design, notes } = makeProjectsHierarchy();
    const vault = makeVault([notes], [projects, design]);

    const result = vault.getDescendantFoldersAndPages('folder-projects');

    expect(result.folders.map((f) => f.id)).toEqual(['folder-design']);
    expect(result.pages.map((p) => p.id)).toEqual(['page-notes']);
  });

  it('excludes an unrelated sibling folder and its pages', () => {
    const { projects, design, notes } = makeProjectsHierarchy();
    const sibling = makeFolder({ id: 'folder-sibling', path: '/vault/Sibling' });
    const siblingPage = makePage({
      id: 'page-sibling',
      path: '/vault/Sibling/Note.md',
      parentId: 'folder-sibling',
    });
    const vault = makeVault([notes, siblingPage], [projects, design, sibling]);

    const result = vault.getDescendantFoldersAndPages('folder-projects');

    expect(result.folders.map((f) => f.id)).not.toContain('folder-sibling');
    expect(result.pages.map((p) => p.id)).not.toContain('page-sibling');
  });

  it('returns empty arrays for a leaf folder', () => {
    const leaf = makeFolder({ id: 'folder-leaf', path: '/vault/Leaf' });
    const vault = makeVault([], [leaf]);

    const result = vault.getDescendantFoldersAndPages('folder-leaf');

    expect(result.folders).toEqual([]);
    expect(result.pages).toEqual([]);
  });

  it('throws for an unknown folder id', () => {
    const vault = makeVault([]);

    expect(() => vault.getDescendantFoldersAndPages('does-not-exist')).toThrow();
  });
});

describe('Vault.removeFolder cascade (ADR-024)', () => {
  it('removes the folder, every descendant folder, and every descendant page', () => {
    const { projects, design, notes } = makeProjectsHierarchy();
    const vault = makeVault([notes], [projects, design]);

    vault.removeFolder('folder-projects');

    expect(vault.getFolder('folder-projects')).toBeUndefined();
    expect(vault.getFolder('folder-design')).toBeUndefined();
    expect(vault.getPage('page-notes')).toBeUndefined();
  });

  it('clears path lookups for the folder, its descendants, and their pages', () => {
    const { projects, design, notes } = makeProjectsHierarchy();
    const vault = makeVault([notes], [projects, design]);

    vault.removeFolder('folder-projects');

    expect(vault.getFolderByPath('/vault/Projects')).toBeUndefined();
    expect(vault.getFolderByPath('/vault/Projects/Design')).toBeUndefined();
    expect(vault.getPageByPath('/vault/Projects/Design/Notes.md')).toBeUndefined();
  });

  it('leaves an unrelated sibling folder and its pages untouched', () => {
    const { projects, design, notes } = makeProjectsHierarchy();
    const sibling = makeFolder({ id: 'folder-sibling', path: '/vault/Sibling' });
    const siblingPage = makePage({
      id: 'page-sibling',
      path: '/vault/Sibling/Note.md',
      parentId: 'folder-sibling',
    });
    const vault = makeVault([notes, siblingPage], [projects, design, sibling]);

    vault.removeFolder('folder-projects');

    expect(vault.getFolder('folder-sibling')).toBeDefined();
    expect(vault.getPage('page-sibling')).toBeDefined();
  });

  it('emits exactly one folder-removed event for a cascade removal', () => {
    const { projects, design, notes } = makeProjectsHierarchy();
    const vault = makeVault([notes], [projects, design]);
    const events: unknown[] = [];

    vault.subscribe((event) => {
      events.push(event);
    });

    vault.removeFolder('folder-projects');

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: 'folder-removed',
      folderId: 'folder-projects',
    });
  });

  it('throws for an unknown folder id, mirroring removePage', () => {
    const vault = makeVault([]);

    expect(() => vault.removeFolder('does-not-exist')).toThrow();
  });

  it('removes a leaf folder with no descendant pages cleanly', () => {
    const leaf = makeFolder({ id: 'folder-leaf', path: '/vault/Leaf' });
    const vault = makeVault([], [leaf]);

    vault.removeFolder('folder-leaf');

    expect(vault.getFolder('folder-leaf')).toBeUndefined();
    expect(vault.getFolderByPath('/vault/Leaf')).toBeUndefined();
  });
});

describe('Vault lazy projections (embeds, knowledgeGraph)', () => {
  it('knowledgeGraph() and embeds() are callable methods, matching spec §3', () => {
    const vault = makeVault([]);

    expect(typeof vault.knowledgeGraph).toBe('function');
    expect(typeof vault.embeds).toBe('function');
  });

  it('returns the same cached reference across consecutive calls with no intervening mutation', () => {
    const vault = makeVault([makePage({ id: 'page-1', path: '/vault/Note.md' })]);

    const graphA = vault.knowledgeGraph();
    const graphB = vault.knowledgeGraph();
    const embedsA = vault.embeds();
    const embedsB = vault.embeds();

    expect(graphB).toBe(graphA);
    expect(embedsB).toBe(embedsA);
  });

  it('rebuilds to a new reference after a mutation invalidates the cache', () => {
    const vault = makeVault([makePage({ id: 'page-1', path: '/vault/Note.md' })]);

    const graphBefore = vault.knowledgeGraph();
    const embedsBefore = vault.embeds();

    vault.addPage(makePage({ id: 'page-2', path: '/vault/Other.md' }));

    const graphAfter = vault.knowledgeGraph();
    const embedsAfter = vault.embeds();

    expect(graphAfter).not.toBe(graphBefore);
    expect(embedsAfter).not.toBe(embedsBefore);
  });

  it('does not rebuild on mutation itself, and rebuilds at most once for several stacked mutations', () => {
    const projectionBuilder = new VaultProjectionBuilder();
    const buildLazySpy = vi.spyOn(projectionBuilder, 'buildLazy');
    const vault = new Vault(
      '/vault',
      [makePage({ id: 'page-1', path: '/vault/Note.md' })],
      [],
      [],
      [],
      [],
      new KnowledgeGraph([]),
      projectionBuilder
    );

    buildLazySpy.mockClear(); // constructor doesn't call buildLazy — clear defensively anyway

    vault.addPage(makePage({ id: 'page-2', path: '/vault/Other.md' }));
    vault.addPage(makePage({ id: 'page-3', path: '/vault/Third.md' }));
    expect(buildLazySpy).not.toHaveBeenCalled();

    vault.knowledgeGraph();
    vault.embeds();
    vault.embeds();
    expect(buildLazySpy).toHaveBeenCalledTimes(1);
  });

  it('tags/tasks stay eagerly correct on every mutation, unaffected by the lazy split', () => {
    const vault = makeVault([]);

    vault.addPage(makePage({ id: 'page-1', path: '/vault/Note.md' }));

    expect(vault.pageCount).toBe(1);
    expect(vault.getPage('page-1')).toBeDefined();
  });
});

describe('Vault.addFolder', () => {
  it('registers the folder by id and by path', () => {
    const vault = makeVault([]);
    const folder = makeFolder({ id: 'folder-1', path: '/vault/Projects' });

    vault.addFolder(folder);

    expect(vault.getFolder('folder-1')).toBe(folder);
    expect(vault.getFolderByPath('/vault/Projects')).toBe(folder);
    expect(vault.folderCount).toBe(1);
  });

  it('rejects a duplicate folder id', () => {
    const existing = makeFolder({ id: 'folder-1', path: '/vault/Projects' });
    const vault = makeVault([], [existing]);

    expect(() =>
      vault.addFolder(makeFolder({ id: 'folder-1', path: '/vault/Other' }))
    ).toThrow(/Folder already exists/);
  });

  it('rejects a duplicate folder path, leaving the original occupant reachable', () => {
    const existing = makeFolder({ id: 'folder-1', path: '/vault/Projects' });
    const vault = makeVault([], [existing]);

    expect(() =>
      vault.addFolder(makeFolder({ id: 'folder-2', path: '/vault/Projects' }))
    ).toThrow(/Folder path already in use/);

    expect(vault.getFolderByPath('/vault/Projects')).toBe(existing);
    expect(vault.getFolder('folder-2')).toBeUndefined();
  });

  it('keeps foldersById/foldersByPath consistent after the mutation', () => {
    const vault = makeVault([]);
    const folder = makeFolder({ id: 'folder-1', path: '/vault/Projects' });

    vault.addFolder(folder);

    const byId = vault.getFolder('folder-1');
    const byPath = vault.getFolderByPath('/vault/Projects');

    expect(byId).toBe(byPath);
  });

  it('notifies listeners with a folder-added event', () => {
    const vault = makeVault([]);
    const listener = vi.fn();
    vault.subscribe(listener);

    const folder = makeFolder({ id: 'folder-1', path: '/vault/Projects' });
    vault.addFolder(folder);

    expect(listener).toHaveBeenCalledWith({
      type: 'folder-added',
      folderId: 'folder-1',
    });
  });

  it('does not touch tag/task projections, unlike addPage', () => {
    const projectionBuilder = new VaultProjectionBuilder();
    const buildEagerSpy = vi.spyOn(projectionBuilder, 'buildEager');
    const vault = new Vault(
      '/vault',
      [],
      [],
      [],
      [],
      [],
      new KnowledgeGraph([]),
      projectionBuilder
    );

    vault.addFolder(makeFolder({ id: 'folder-1', path: '/vault/Projects' }));

    expect(buildEagerSpy).not.toHaveBeenCalled();
  });
});
