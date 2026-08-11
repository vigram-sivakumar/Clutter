import { describe, expect, it, vi } from 'vitest';
import { FolderOperations } from './FolderOperations';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from './FolderCreator';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { Workspace } from '../../workspace/Workspace';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { MoveService } from '../../vault/persistence/MoveService';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import type { Folder } from '../../vault/models/Folder';
import type { Page } from '../../vault/models/Page';
import type { IdGenerator } from '../../shared/identity/IdGenerator';

const ROOT = '/vault';

function makeFolder(id: string, path: string, parentId: string | null = null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: {
      icon: null,
      favorite: false,
      description: '',
      cover: null,
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    },
  };
}

function makePage(id: string, path: string, parentId: string | null): Page {
  return {
    id,
    type: 'note',
    name: path.slice(path.lastIndexOf('/') + 1).replace('.md', ''),
    path,
    parentId,
    metadata: {
      icon: null,
      cover: null,
      description: null,
      favorite: false,
      status: 'active',
      archivedAt: null,
      originalParentId: null,
      originalPath: null,
      createdAt: null,
      updatedAt: null,
    },
    source: { markdown: '' },
    analysis: {
      headings: [],
      aliases: [],
      blockReferences: [],
      tasks: [],
      tags: [],
      links: [],
      embeds: [],
    },
  };
}

function makeVault(folders: Folder[] = [], pages: Page[] = []): Vault {
  return new Vault(
    ROOT,
    pages,
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

function makeSequentialIdGenerator(ids: string[]): IdGenerator {
  let index = 0;
  return {
    generate: () => ids[index++] ?? `id-${index}`,
  };
}

function setup(
  folders: Folder[] = [],
  ids: string[] = ['folder-new'],
  prepareNavigation: () => void = () => {},
  pages: Page[] = [],
  openFallbackPage: () => void = () => {}
) {
  const vault = makeVault(folders, pages);
  const workspace = new Workspace();
  const fileSystem = new InMemoryVaultFileSystem();
  const moveService = new MoveService(vault, fileSystem);
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService
  );
  const documentRegistry = new DocumentRegistry();
  const saveCoordinator = new SaveCoordinator();
  const folderOperations = new FolderOperations(
    vault,
    workspace,
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(makeSequentialIdGenerator(ids)),
    prepareNavigation,
    documentRegistry,
    saveCoordinator,
    openFallbackPage
  );

  return { vault, workspace, fileSystem, folderOperations, documentRegistry, saveCoordinator };
}

describe('FolderOperations.open()', () => {
  it('opens the folder in the workspace', async () => {
    const { folderOperations, workspace } = setup([
      makeFolder('folder-1', `${ROOT}/Projects`),
    ]);

    await folderOperations.open('folder-1');

    expect(workspace.activeFolderId).toBe('folder-1');
  });

  it('throws for an unknown folder id', async () => {
    const { folderOperations } = setup();

    await expect(folderOperations.open('does-not-exist')).rejects.toThrow(
      /Folder not found/
    );
  });

  it('calls prepareNavigation before switching the workspace to the new folder', async () => {
    const prepareNavigation = vi.fn();
    const { folderOperations, workspace } = setup(
      [makeFolder('folder-1', `${ROOT}/Projects`)],
      undefined,
      prepareNavigation
    );

    await folderOperations.open('folder-1');

    expect(prepareNavigation).toHaveBeenCalledTimes(1);
    expect(prepareNavigation).toHaveBeenCalledWith();
    expect(workspace.activeFolderId).toBe('folder-1');
  });

  it('does not call prepareNavigation for a failed open (unknown folder id) — no navigation actually happens', async () => {
    const prepareNavigation = vi.fn();
    const { folderOperations } = setup([], undefined, prepareNavigation);

    await expect(folderOperations.open('does-not-exist')).rejects.toThrow();

    expect(prepareNavigation).not.toHaveBeenCalled();
  });

  it('is page-agnostic — FolderOperations never inspects what prepareNavigation does, only that it gets called', async () => {
    // The hook here does something FolderOperations has no concept of
    // (touching a page-shaped id) — proving this facade doesn't know or
    // care what the callback represents, only that it's invoked before
    // the workspace switch (autosave-ownership.md's page-agnostic
    // navigation hook design).
    const calls: string[] = [];
    const prepareNavigation = () => calls.push('flushed-something-page-shaped');
    const { folderOperations } = setup(
      [makeFolder('folder-1', `${ROOT}/Projects`)],
      undefined,
      prepareNavigation
    );

    await folderOperations.open('folder-1');

    expect(calls).toEqual(['flushed-something-page-shaped']);
  });
});

describe('FolderOperations.create()', () => {
  it('creates the folder at the vault root when parentId is null, and returns its persisted id', async () => {
    const { vault, fileSystem, folderOperations } = setup();

    const id = await folderOperations.create('Projects', null);

    expect(id).toBe('folder-new');
    expect(await fileSystem.exists(`${ROOT}/Projects`)).toBe(true);
    expect(fileSystem.hasFileSync(`${ROOT}/Projects/.folder.md`)).toBe(true);

    const created = vault.getFolder('folder-new');
    expect(created).toBeDefined();
    expect(created!.path).toBe(`${ROOT}/Projects`);
    expect(created!.parentId).toBeNull();
  });

  it('creates the folder nested under an existing parent', async () => {
    const parent = makeFolder('parent-folder', `${ROOT}/Projects`);
    const { vault, folderOperations } = setup([parent]);

    const id = await folderOperations.create('Q1', 'parent-folder');

    const created = vault.getFolder(id);
    expect(created!.parentId).toBe('parent-folder');
    expect(created!.path).toBe(`${ROOT}/Projects/Q1`);
  });

  it('is immediately visible in the vault after create() resolves', async () => {
    const { vault, folderOperations } = setup();

    await folderOperations.create('Projects', null);

    expect(vault.folderCount).toBe(1);
    expect(vault.getFolderByPath(`${ROOT}/Projects`)).toBeDefined();
  });

  it('picks a collision-free name when one already exists', async () => {
    const existing = makeFolder('folder-existing', `${ROOT}/Projects`);
    const { vault, folderOperations } = setup([existing]);

    const id = await folderOperations.create('Projects', null);

    const created = vault.getFolder(id);
    expect(created!.path).toBe(`${ROOT}/Projects 2`);
  });

  it('throws for an unknown parentId, without writing anything', async () => {
    const { fileSystem, folderOperations } = setup();

    await expect(
      folderOperations.create('Q1', 'does-not-exist')
    ).rejects.toThrow(/Folder not found: does-not-exist/);

    expect(await fileSystem.exists(`${ROOT}/Q1`)).toBe(false);
  });
});

describe('FolderOperations.delete() (ADR-024)', () => {
  it('deletes the folder from the vault and disk', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, fileSystem, folderOperations } = setup([folder]);
    await fileSystem.createDirectory(folder.path);

    await folderOperations.delete('folder-1');

    expect(vault.getFolder('folder-1')).toBeUndefined();
    expect(await fileSystem.exists(folder.path)).toBe(false);
  });

  it('closes every descendant page\'s open session before enqueueing the cascade delete (ADR-024 resolved decision #2)', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const page = makePage('page-1', `${ROOT}/Projects/Notes.md`, 'folder-1');
    const { fileSystem, folderOperations, documentRegistry } = setup([folder], undefined, undefined, [
      page,
    ]);
    await fileSystem.createDirectory(folder.path);
    await fileSystem.writeFile(page.path, '# Notes');

    documentRegistry.open('page-1', '# Notes');
    expect(documentRegistry.get('page-1')).toBeDefined();

    await folderOperations.delete('folder-1');

    expect(documentRegistry.get('page-1')).toBeUndefined();
  });

  it('cancels a descendant page\'s pending autosave timer before enqueueing the cascade delete', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const page = makePage('page-1', `${ROOT}/Projects/Notes.md`, 'folder-1');
    const { fileSystem, folderOperations, saveCoordinator } = setup([folder], undefined, undefined, [
      page,
    ]);
    await fileSystem.createDirectory(folder.path);
    await fileSystem.writeFile(page.path, '# Notes');

    const cancelSpy = vi.spyOn(saveCoordinator, 'cancelTimers');

    await folderOperations.delete('folder-1');

    expect(cancelSpy).toHaveBeenCalledWith('page-1');
  });

  it('does nothing (no throw) for an unknown folder id — the Gate abandons harmlessly', async () => {
    const { folderOperations } = setup();

    await expect(folderOperations.delete('does-not-exist')).resolves.toBeUndefined();
  });

  it('cascades to descendant pages and folders', async () => {
    const projects = makeFolder('folder-projects', `${ROOT}/Projects`);
    const design = makeFolder('folder-design', `${ROOT}/Projects/Design`, 'folder-projects');
    const notes = makePage('page-notes', `${ROOT}/Projects/Design/Notes.md`, 'folder-design');
    const { vault, fileSystem, folderOperations } = setup(
      [projects, design],
      undefined,
      undefined,
      [notes]
    );
    await fileSystem.createDirectory(design.path);
    await fileSystem.writeFile(notes.path, '# Notes');

    await folderOperations.delete('folder-projects');

    expect(vault.getFolder('folder-projects')).toBeUndefined();
    expect(vault.getFolder('folder-design')).toBeUndefined();
    expect(vault.getPage('page-notes')).toBeUndefined();
  });
});

describe('FolderOperations.delete() post-delete navigation (consistency fix)', () => {
  it('clears the active view when the deleted folder was active, and does not ask for a fallback if another view is already active', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const openFallbackPage = vi.fn();
    const { vault, fileSystem, folderOperations, workspace } = setup(
      [folder],
      undefined,
      undefined,
      [],
      openFallbackPage
    );
    await fileSystem.createDirectory(folder.path);
    workspace.openFolder('folder-1');

    await folderOperations.delete('folder-1');

    expect(vault.getFolder('folder-1')).toBeUndefined();
    expect(workspace.activeFolderId).toBeNull();
  });

  it('closes every descendant page\'s workspace tab, not just its DocumentRegistry session', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const page = makePage('page-1', `${ROOT}/Projects/Notes.md`, 'folder-1');
    const { fileSystem, folderOperations, workspace } = setup(
      [folder],
      undefined,
      undefined,
      [page]
    );
    await fileSystem.createDirectory(folder.path);
    await fileSystem.writeFile(page.path, '# Notes');
    workspace.openPage('page-1');
    expect(workspace.isPageOpen('page-1')).toBe(true);

    await folderOperations.delete('folder-1');

    expect(workspace.isPageOpen('page-1')).toBe(false);
  });

  it('asks for a fallback page when deleting the active folder leaves the workspace with nothing active — same hook PageOperations.delete() uses (ADR-025)', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const openFallbackPage = vi.fn();
    const { fileSystem, folderOperations, workspace } = setup(
      [folder],
      undefined,
      undefined,
      [],
      openFallbackPage
    );
    await fileSystem.createDirectory(folder.path);
    workspace.openFolder('folder-1');

    await folderOperations.delete('folder-1');

    expect(openFallbackPage).toHaveBeenCalledTimes(1);
  });

  it('asks for a fallback page when deleting a folder leaves no active page after its active descendant page is closed', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const page = makePage('page-1', `${ROOT}/Projects/Notes.md`, 'folder-1');
    const openFallbackPage = vi.fn();
    const { fileSystem, folderOperations, workspace } = setup(
      [folder],
      undefined,
      undefined,
      [page],
      openFallbackPage
    );
    await fileSystem.createDirectory(folder.path);
    await fileSystem.writeFile(page.path, '# Notes');
    workspace.openPage('page-1');

    await folderOperations.delete('folder-1');

    expect(workspace.activeView).toBeNull();
    expect(openFallbackPage).toHaveBeenCalledTimes(1);
  });

  it('does not ask for a fallback page when deleting a folder that is not the active view and has no active descendant', async () => {
    const active = makeFolder('folder-active', `${ROOT}/Active`);
    const toDelete = makeFolder('folder-1', `${ROOT}/Projects`);
    const openFallbackPage = vi.fn();
    const { fileSystem, folderOperations, workspace } = setup(
      [active, toDelete],
      undefined,
      undefined,
      [],
      openFallbackPage
    );
    await fileSystem.createDirectory(active.path);
    await fileSystem.createDirectory(toDelete.path);
    workspace.openFolder('folder-active');

    await folderOperations.delete('folder-1');

    expect(workspace.activeFolderId).toBe('folder-active');
    expect(openFallbackPage).not.toHaveBeenCalled();
  });
});

describe('FolderOperations.rename() (ADR-024, interim same-parent-only kind)', () => {
  it('renames the folder in place', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, fileSystem, folderOperations } = setup([folder]);
    await fileSystem.createDirectory(folder.path);

    await folderOperations.rename('folder-1', 'Work');

    const renamed = vault.getFolder('folder-1');
    expect(renamed!.path).toBe(`${ROOT}/Work`);
    expect(renamed!.name).toBe('Work');
  });

  it('does nothing (no throw) for an unknown folder id — the Gate abandons harmlessly', async () => {
    const { folderOperations } = setup();

    await expect(folderOperations.rename('does-not-exist', 'Anything')).resolves.toBeUndefined();
  });
});

describe('FolderOperations.archive() (ADR-026)', () => {
  it('archives an empty folder into the reserved Archive folder', async () => {
    const archiveFolder = makeFolder('folder-archive', `${ROOT}/Archive`);
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, fileSystem, folderOperations } = setup([archiveFolder, folder]);
    await fileSystem.createDirectory(folder.path);

    await folderOperations.archive('folder-1');

    const archived = vault.getFolder('folder-1')!;
    expect(archived.path).toBe(`${ROOT}/Archive/Projects`);
    expect(archived.parentId).toBe('folder-archive');
    expect(archived.metadata.status).toBe('archived');
  });

  it('archives a folder with nested folders and pages as one operation, preserving every id', async () => {
    const archiveFolder = makeFolder('folder-archive', `${ROOT}/Archive`);
    const projects = makeFolder('folder-projects', `${ROOT}/Projects`);
    const design = makeFolder('folder-design', `${ROOT}/Projects/Design`, 'folder-projects');
    const notes = makePage('page-notes', `${ROOT}/Projects/Design/Notes.md`, 'folder-design');
    const { vault, fileSystem, folderOperations } = setup(
      [archiveFolder, projects, design],
      undefined,
      undefined,
      [notes]
    );
    await fileSystem.createDirectory(design.path);
    await fileSystem.writeFile(notes.path, '# Notes');

    await folderOperations.archive('folder-projects');

    expect(vault.getFolder('folder-projects')!.metadata.status).toBe('archived');
    expect(vault.getFolder('folder-design')!.id).toBe('folder-design');
    expect(vault.getFolder('folder-design')!.path).toBe(`${ROOT}/Archive/Projects/Design`);
    expect(vault.getFolder('folder-design')!.parentId).toBe('folder-projects');
    expect(vault.getPage('page-notes')!.id).toBe('page-notes');
    expect(vault.getPage('page-notes')!.path).toBe(
      `${ROOT}/Archive/Projects/Design/Notes.md`
    );
  });

  it('does nothing (no throw) for an unknown folder id — the Gate abandons harmlessly', async () => {
    const { folderOperations } = setup();

    await expect(folderOperations.archive('does-not-exist')).resolves.toBeUndefined();
  });

  it('rejects archiving an already-archived folder', async () => {
    const archiveFolder = makeFolder('folder-archive', `${ROOT}/Archive`);
    const folder: Folder = {
      ...makeFolder('folder-1', `${ROOT}/Archive/Projects`, 'folder-archive'),
      metadata: {
        icon: null,
        favorite: false,
        description: '',
        cover: null,
        status: 'archived',
        archivedAt: '2026-01-01T00:00:00.000Z',
        originalPath: `${ROOT}/Projects`,
        originalParentId: null,
      },
    };
    const { fileSystem, folderOperations } = setup([archiveFolder, folder]);
    await fileSystem.createDirectory(folder.path);

    await expect(folderOperations.archive('folder-1')).rejects.toThrow(
      /Folder is already archived/
    );
  });
});

// Consistency fix: archive() previously performed no navigation at all —
// any fallback was ad hoc, duplicated glue in the UI layer (PageHost.tsx/
// Archive ≠ Delete: archive is a soft-delete — the folder and its subtree
// still exist, only relocated into Archive/ and restatused. It must never
// touch Workspace, whether or not the archived folder is the active view.
// Workspace tracks the active view by folder id, and the Gate's
// 'archive-folder' dispatch updates that same folder in Vault in place, so
// an open active folder simply keeps rendering itself at its new Archive/
// location — no close, no fallback.
describe('FolderOperations.archive() navigation (Archive ≠ Delete)', () => {
  it('keeps the active folder open after archiving it', async () => {
    const archiveFolder = makeFolder('folder-archive', `${ROOT}/Archive`);
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const openFallbackPage = vi.fn();
    const { fileSystem, folderOperations, workspace, vault } = setup(
      [archiveFolder, folder],
      undefined,
      undefined,
      [],
      openFallbackPage
    );
    await fileSystem.createDirectory(folder.path);
    workspace.openFolder('folder-1');

    await folderOperations.archive('folder-1');

    expect(workspace.activeFolderId).toBe('folder-1');
    expect(openFallbackPage).not.toHaveBeenCalled();
    expect(vault.getFolder('folder-1')!.metadata.status).toBe('archived');
  });

  it('does not ask for a fallback, and does not touch the active view, when archiving a folder that is not active', async () => {
    const archiveFolder = makeFolder('folder-archive', `${ROOT}/Archive`);
    const active = makeFolder('folder-active', `${ROOT}/Active`);
    const toArchive = makeFolder('folder-1', `${ROOT}/Projects`);
    const openFallbackPage = vi.fn();
    const { fileSystem, folderOperations, workspace } = setup(
      [archiveFolder, active, toArchive],
      undefined,
      undefined,
      [],
      openFallbackPage
    );
    await fileSystem.createDirectory(active.path);
    await fileSystem.createDirectory(toArchive.path);
    workspace.openFolder('folder-active');

    await folderOperations.archive('folder-1');

    expect(workspace.activeFolderId).toBe('folder-active');
    expect(openFallbackPage).not.toHaveBeenCalled();
  });

  it('does not touch an open descendant page\'s tab — archive is soft, unlike delete', async () => {
    const archiveFolder = makeFolder('folder-archive', `${ROOT}/Archive`);
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const page = makePage('page-1', `${ROOT}/Projects/Notes.md`, 'folder-1');
    const openFallbackPage = vi.fn();
    const { fileSystem, folderOperations, workspace } = setup(
      [archiveFolder, folder],
      undefined,
      undefined,
      [page],
      openFallbackPage
    );
    await fileSystem.createDirectory(folder.path);
    await fileSystem.writeFile(page.path, '# Notes');
    workspace.openPage('page-1');

    await folderOperations.archive('folder-1');

    expect(workspace.isPageOpen('page-1')).toBe(true);
    expect(openFallbackPage).not.toHaveBeenCalled();
  });
});
