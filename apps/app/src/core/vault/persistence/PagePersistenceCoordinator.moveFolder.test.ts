import { describe, expect, it } from 'vitest';
import { PagePersistenceCoordinator } from './PagePersistenceCoordinator';
import { MoveService } from './MoveService';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Folder } from '../../vault/models/Folder';
import type { Page } from '../../vault/models/Page';

const ROOT = '/vault';

const defaultFolderMetadata: Folder['metadata'] = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  status: 'active',
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

const defaultPageMetadata: Page['metadata'] = {
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
};

const defaultAnalysis: Page['analysis'] = {
  headings: [],
  aliases: [],
  blockReferences: [],
  tasks: [],
  tags: [],
  links: [],
  embeds: [],
};

function makeFolder(id: string, path: string, parentId: string | null = null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: defaultFolderMetadata,
  };
}

function makePage(id: string, path: string, parentId: string | null): Page {
  return {
    id,
    type: 'note',
    name: path.slice(path.lastIndexOf('/') + 1).replace('.md', ''),
    path,
    parentId,
    metadata: defaultPageMetadata,
    source: { markdown: '' },
    analysis: defaultAnalysis,
  };
}

function makeVault(pages: Page[], folders: Folder[]): Vault {
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

function setup(pages: Page[] = [], folders: Folder[] = []) {
  const vault = makeVault(pages, folders);
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

  return { vault, fileSystem, coordinator };
}

describe('PagePersistenceCoordinator move-folder vertical slice (ADR-024) — same-parent (rename)', () => {
  it('renames the folder in place — same parentId, new path, new name', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, fileSystem, coordinator } = setup([], [folder]);
    await fileSystem.createDirectory(folder.path);
    await fileSystem.writeFile(`${folder.path}/.folder.md`, '---\nid: folder-1\n---\n');

    const result = await coordinator.enqueue('folder-1', {
      kind: 'move-folder',
      destinationFolderId: null,
      name: 'Work',
    });

    expect(result.status).toBe('folder-renamed');
    const renamed = vault.getFolder('folder-1');
    expect(renamed!.path).toBe(`${ROOT}/Work`);
    expect(renamed!.parentId).toBeNull();
    expect(renamed!.name).toBe('Work');
    expect(await fileSystem.exists(`${ROOT}/Work`)).toBe(true);
    expect(await fileSystem.exists(`${ROOT}/Work/.folder.md`)).toBe(true);
    expect(await fileSystem.exists(folder.path)).toBe(false);
  });

  it('cascades the rename to every descendant folder and page path, keeping ids stable', async () => {
    const projects = makeFolder('folder-projects', `${ROOT}/Projects`);
    const design = makeFolder('folder-design', `${ROOT}/Projects/Design`, 'folder-projects');
    const notes = makePage('page-notes', `${ROOT}/Projects/Design/Notes.md`, 'folder-design');
    const { vault, fileSystem, coordinator } = setup([notes], [projects, design]);
    await fileSystem.createDirectory(design.path);
    await fileSystem.writeFile(notes.path, '# Notes');

    const result = await coordinator.enqueue('folder-projects', {
      kind: 'move-folder',
      destinationFolderId: null,
      name: 'Work',
    });

    expect(result.status).toBe('folder-renamed');
    expect(vault.getFolder('folder-projects')!.path).toBe(`${ROOT}/Work`);
    expect(vault.getFolder('folder-design')!.path).toBe(`${ROOT}/Work/Design`);
    expect(vault.getFolder('folder-design')!.parentId).toBe('folder-projects');
    expect(vault.getPage('page-notes')!.path).toBe(`${ROOT}/Work/Design/Notes.md`);
    expect(await fileSystem.exists(`${ROOT}/Work/Design/Notes.md`)).toBe(true);
  });

  it('renaming to the current name is a harmless no-op, not a self-collision', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, fileSystem, coordinator } = setup([], [folder]);
    await fileSystem.createDirectory(folder.path);

    const result = await coordinator.enqueue('folder-1', {
      kind: 'move-folder',
      destinationFolderId: null,
      name: 'Projects',
    });

    expect(result.status).toBe('folder-renamed');
    expect(vault.getFolder('folder-1')!.path).toBe(`${ROOT}/Projects`);
  });

  it('appends a numeric suffix when the new name collides with an existing sibling', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const existing = makeFolder('folder-2', `${ROOT}/Work`);
    const { vault, fileSystem, coordinator } = setup([], [folder, existing]);
    await fileSystem.createDirectory(folder.path);

    const result = await coordinator.enqueue('folder-1', {
      kind: 'move-folder',
      destinationFolderId: null,
      name: 'Work',
    });

    expect(result.status).toBe('folder-renamed');
    expect(vault.getFolder('folder-1')!.path).toBe(`${ROOT}/Work 2`);
    // The pre-existing folder at /vault/Work is untouched.
    expect(vault.getFolder('folder-2')!.path).toBe(`${ROOT}/Work`);
  });

  it('abandons harmlessly for a folder id that no longer exists, without wedging the queue', async () => {
    const { vault, fileSystem, coordinator } = setup();

    const result = await coordinator.enqueue('does-not-exist', {
      kind: 'move-folder',
      destinationFolderId: null,
      name: 'Anything',
    });

    expect(result.status).toBe('abandoned');

    const folder = makeFolder('folder-new', `${ROOT}/New`);
    vault.addFolder(folder);
    await fileSystem.createDirectory(folder.path);
    const followUp = await coordinator.enqueue('folder-new', {
      kind: 'move-folder',
      destinationFolderId: null,
      name: 'Renamed',
    });
    expect(followUp.status).toBe('folder-renamed');
  });

  it('a same-parent rename (destinationFolderId matching the current parentId) never changes parentId', async () => {
    const parent = makeFolder('folder-parent', `${ROOT}/Parent`);
    const child = makeFolder('folder-child', `${ROOT}/Parent/Child`, 'folder-parent');
    const { vault, fileSystem, coordinator } = setup([], [parent, child]);
    await fileSystem.createDirectory(child.path);

    await coordinator.enqueue('folder-child', {
      kind: 'move-folder',
      destinationFolderId: 'folder-parent',
      name: 'Renamed',
    });

    expect(vault.getFolder('folder-child')!.parentId).toBe('folder-parent');
    expect(vault.getFolder('folder-child')!.path).toBe(`${ROOT}/Parent/Renamed`);
  });

  it('rejects renaming an archived folder in place', async () => {
    const folder = {
      ...makeFolder('folder-1', `${ROOT}/Archive/Projects`),
      metadata: { ...defaultFolderMetadata, status: 'archived' as const },
    };
    const { fileSystem, coordinator } = setup([], [folder]);
    await fileSystem.createDirectory(folder.path);

    await expect(
      coordinator.enqueue('folder-1', { kind: 'move-folder', destinationFolderId: null, name: 'Renamed' })
    ).rejects.toThrow(/Cannot move an archived folder/);
  });
});

describe('PagePersistenceCoordinator move-folder vertical slice (ADR-024) — reparenting (move)', () => {
  it('reparents the folder into an arbitrary destination, preserving its name', async () => {
    const source = makeFolder('folder-1', `${ROOT}/Projects`);
    const destination = makeFolder('folder-2', `${ROOT}/Archived-Ideas`);
    const { vault, fileSystem, coordinator } = setup([], [source, destination]);
    await fileSystem.createDirectory(source.path);
    await fileSystem.createDirectory(destination.path);

    const result = await coordinator.enqueue('folder-1', {
      kind: 'move-folder',
      destinationFolderId: 'folder-2',
    });

    expect(result.status).toBe('folder-renamed');
    expect(vault.getFolder('folder-1')!.path).toBe(`${ROOT}/Archived-Ideas/Projects`);
    expect(vault.getFolder('folder-1')!.parentId).toBe('folder-2');
    expect(await fileSystem.exists(`${ROOT}/Archived-Ideas/Projects`)).toBe(true);
    expect(await fileSystem.exists(source.path)).toBe(false);
  });

  it('cascades a reparenting move to every descendant folder and page path, keeping ids stable', async () => {
    const projects = makeFolder('folder-projects', `${ROOT}/Projects`);
    const design = makeFolder('folder-design', `${ROOT}/Projects/Design`, 'folder-projects');
    const notes = makePage('page-notes', `${ROOT}/Projects/Design/Notes.md`, 'folder-design');
    const destination = makeFolder('folder-dest', `${ROOT}/Later`);
    const { vault, fileSystem, coordinator } = setup([notes], [projects, design, destination]);
    await fileSystem.createDirectory(design.path);
    await fileSystem.createDirectory(destination.path);
    await fileSystem.writeFile(notes.path, '# Notes');

    await coordinator.enqueue('folder-projects', {
      kind: 'move-folder',
      destinationFolderId: 'folder-dest',
    });

    expect(vault.getFolder('folder-projects')!.path).toBe(`${ROOT}/Later/Projects`);
    expect(vault.getFolder('folder-projects')!.parentId).toBe('folder-dest');
    expect(vault.getFolder('folder-design')!.path).toBe(`${ROOT}/Later/Projects/Design`);
    expect(vault.getPage('page-notes')!.path).toBe(`${ROOT}/Later/Projects/Design/Notes.md`);
    expect(await fileSystem.exists(`${ROOT}/Later/Projects/Design/Notes.md`)).toBe(true);
  });

  it('rejects moving a folder into itself', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { fileSystem, coordinator } = setup([], [folder]);
    await fileSystem.createDirectory(folder.path);

    await expect(
      coordinator.enqueue('folder-1', { kind: 'move-folder', destinationFolderId: 'folder-1' })
    ).rejects.toThrow(/Cannot move folder into itself or a descendant/);
  });

  it('rejects moving a folder into its own descendant', async () => {
    const parent = makeFolder('folder-1', `${ROOT}/Projects`);
    const child = makeFolder('folder-2', `${ROOT}/Projects/Sub`, 'folder-1');
    const { fileSystem, coordinator } = setup([], [parent, child]);
    await fileSystem.createDirectory(child.path);

    await expect(
      coordinator.enqueue('folder-1', { kind: 'move-folder', destinationFolderId: 'folder-2' })
    ).rejects.toThrow(/Cannot move folder into itself or a descendant/);
  });

  it('rejects moving a folder into the reserved Daily Notes folder', async () => {
    const dailyNotes = makeFolder('folder-daily-notes', `${ROOT}/Daily Notes`);
    const source = makeFolder('folder-1', `${ROOT}/Projects`);
    const { fileSystem, coordinator } = setup([], [dailyNotes, source]);
    await fileSystem.createDirectory(source.path);

    await expect(
      coordinator.enqueue('folder-1', { kind: 'move-folder', destinationFolderId: 'folder-daily-notes' })
    ).rejects.toThrow(/Cannot move into Daily Notes/);
  });

  it('rejects moving a folder that lives inside the reserved Daily Notes folder', async () => {
    const dailyNotes = makeFolder('folder-daily-notes', `${ROOT}/Daily Notes`);
    const nested = makeFolder('folder-nested', `${ROOT}/Daily Notes/2026`, 'folder-daily-notes');
    const destination = makeFolder('folder-dest', `${ROOT}/Elsewhere`);
    const { fileSystem, coordinator } = setup([], [dailyNotes, nested, destination]);
    await fileSystem.createDirectory(nested.path);
    await fileSystem.createDirectory(destination.path);

    await expect(
      coordinator.enqueue('folder-nested', { kind: 'move-folder', destinationFolderId: 'folder-dest' })
    ).rejects.toThrow(/Cannot move a folder out of Daily Notes/);
  });

  it('rejects moving an archived folder', async () => {
    const source = {
      ...makeFolder('folder-1', `${ROOT}/Archive/Projects`),
      metadata: { ...defaultFolderMetadata, status: 'archived' as const },
    };
    const destination = makeFolder('folder-dest', `${ROOT}/Elsewhere`);
    const { fileSystem, coordinator } = setup([], [source, destination]);
    await fileSystem.createDirectory(source.path);
    await fileSystem.createDirectory(destination.path);

    await expect(
      coordinator.enqueue('folder-1', { kind: 'move-folder', destinationFolderId: 'folder-dest' })
    ).rejects.toThrow(/Cannot move an archived folder/);
  });

  it('throws for an unknown destination folder id, abandoning nothing on disk', async () => {
    const source = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, fileSystem, coordinator } = setup([], [source]);
    await fileSystem.createDirectory(source.path);

    await expect(
      coordinator.enqueue('folder-1', { kind: 'move-folder', destinationFolderId: 'does-not-exist' })
    ).rejects.toThrow(/Folder not found: does-not-exist/);

    expect(vault.getFolder('folder-1')!.path).toBe(source.path);
    expect(await fileSystem.exists(source.path)).toBe(true);
  });
});
