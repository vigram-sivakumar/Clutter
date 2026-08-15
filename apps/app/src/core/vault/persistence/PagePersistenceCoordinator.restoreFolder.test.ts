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
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';
import type { Folder } from '../../vault/models/Folder';
import type { Page } from '../../vault/models/Page';

const ROOT = '/vault';
const ARCHIVE_FOLDER_ID = 'folder-archive';

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

function makeFolder(
  id: string,
  path: string,
  parentId: string | null = null,
  metadata: Folder['metadata'] = defaultFolderMetadata
): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata,
  };
}

function makeArchiveFolder(): Folder {
  return makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`, null);
}

// The archived-folder fixture Restore acts on: sits under Archive/, keyed
// on originalPath alone (never originalParentId) — mirrors
// PageOperations.archiveRestore.test.ts's buildArchivedPage exactly, one
// aggregate over.
function makeArchivedFolder(options: {
  id: string;
  archivePath: string;
  originalPath: string;
  originalParentId: string | null;
}): Folder {
  return makeFolder(options.id, options.archivePath, ARCHIVE_FOLDER_ID, {
    icon: null,
    favorite: false,
    description: '',
    cover: null,
    status: 'archived',
    archivedAt: '2026-07-29T00:00:00.000Z',
    originalPath: options.originalPath,
    originalParentId: options.originalParentId,
  });
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

describe('PagePersistenceCoordinator restore-folder vertical slice (ADR-026 follow-up)', () => {
  it('restores a folder to its exact original path and clears archive metadata', async () => {
    const projects = makeFolder('folder-projects', `${ROOT}/Projects`);
    const archived = makeArchivedFolder({
      id: 'folder-design',
      archivePath: `${ROOT}/Archive/Design`,
      originalPath: `${ROOT}/Projects/Design`,
      originalParentId: 'folder-projects',
    });
    const archiveFolder = makeArchiveFolder();
    const { vault, fileSystem, coordinator } = setup(
      [],
      [projects, archived, archiveFolder]
    );
    await fileSystem.createDirectory(archived.path);
    await fileSystem.writeFile(`${archived.path}/.folder.md`, '---\nid: folder-design\n---\n');

    const result = await coordinator.enqueue('folder-design', { kind: 'restore-folder' });

    expect(result.status).toBe('folder-restored');
    const restored = vault.getFolder('folder-design')!;
    expect(restored.path).toBe(`${ROOT}/Projects/Design`);
    expect(restored.parentId).toBe('folder-projects');
    expect(restored.metadata.status).toBe('active');
    expect(restored.metadata.archivedAt).toBeNull();
    expect(restored.metadata.originalPath).toBeNull();
    expect(restored.metadata.originalParentId).toBeNull();
    expect(await fileSystem.exists(`${ROOT}/Projects/Design`)).toBe(true);
    expect(await fileSystem.exists(archived.path)).toBe(false);

    const written = await fileSystem.readFile(`${ROOT}/Projects/Design/.folder.md`);
    expect(written).toContain('status: active');
  });

  it('original parent folder was deleted: restores directly at vault root', async () => {
    const archived = makeArchivedFolder({
      id: 'folder-design',
      archivePath: `${ROOT}/Archive/Design`,
      originalPath: `${ROOT}/Projects/Design`,
      originalParentId: 'folder-projects',
    });
    const archiveFolder = makeArchiveFolder();
    const { vault, fileSystem, coordinator } = setup([], [archived, archiveFolder]);
    await fileSystem.createDirectory(archived.path);

    const result = await coordinator.enqueue('folder-design', { kind: 'restore-folder' });

    expect(result.status).toBe('folder-restored');
    const restored = vault.getFolder('folder-design')!;
    expect(restored.path).toBe(`${ROOT}/Design`);
    expect(restored.parentId).toBeNull();
    expect(await fileSystem.exists(`${ROOT}/Design`)).toBe(true);
  });

  it('original parent folder was renamed while archived: old originalPath no longer exists, restores to vault root', async () => {
    const renamedProjects = makeFolder('folder-projects', `${ROOT}/Work`);
    const archived = makeArchivedFolder({
      id: 'folder-design',
      archivePath: `${ROOT}/Archive/Design`,
      originalPath: `${ROOT}/Projects/Design`,
      originalParentId: 'folder-projects',
    });
    const archiveFolder = makeArchiveFolder();
    const { vault, fileSystem, coordinator } = setup(
      [],
      [renamedProjects, archived, archiveFolder]
    );
    await fileSystem.createDirectory(archived.path);

    const result = await coordinator.enqueue('folder-design', { kind: 'restore-folder' });

    expect(result.status).toBe('folder-restored');
    const restored = vault.getFolder('folder-design')!;
    expect(restored.path).toBe(`${ROOT}/Design`);
    expect(restored.parentId).toBeNull();
  });

  it('original parent folder was deleted and a new folder was later created at the same original path: restores there, using the new folder id', async () => {
    const archived = makeArchivedFolder({
      id: 'folder-design',
      archivePath: `${ROOT}/Archive/Design`,
      originalPath: `${ROOT}/Projects/Design`,
      originalParentId: 'folder-projects',
    });
    const recreatedProjects = makeFolder('folder-projects-recreated', `${ROOT}/Projects`);
    const archiveFolder = makeArchiveFolder();
    const { vault, fileSystem, coordinator } = setup(
      [],
      [recreatedProjects, archived, archiveFolder]
    );
    await fileSystem.createDirectory(archived.path);

    const result = await coordinator.enqueue('folder-design', { kind: 'restore-folder' });

    expect(result.status).toBe('folder-restored');
    const restored = vault.getFolder('folder-design')!;
    expect(restored.path).toBe(`${ROOT}/Projects/Design`);
    expect(restored.parentId).toBe('folder-projects-recreated');
    expect(restored.parentId).not.toBe('folder-projects');
  });

  it('descendants move with the restored folder, keeping their ids and their own metadata untouched', async () => {
    const archived = makeArchivedFolder({
      id: 'folder-projects',
      archivePath: `${ROOT}/Archive/Projects`,
      originalPath: `${ROOT}/Projects`,
      originalParentId: null,
    });
    const design = makeFolder('folder-design', `${ROOT}/Archive/Projects/Design`, 'folder-projects');
    const notes = makePage('page-notes', `${ROOT}/Archive/Projects/Design/Notes.md`, 'folder-design');
    const archiveFolder = makeArchiveFolder();
    const { vault, fileSystem, coordinator } = setup(
      [notes],
      [archived, design, archiveFolder]
    );
    await fileSystem.createDirectory(design.path);
    await fileSystem.writeFile(notes.path, '# Notes');

    const result = await coordinator.enqueue('folder-projects', { kind: 'restore-folder' });

    expect(result.status).toBe('folder-restored');
    expect(vault.getFolder('folder-projects')!.path).toBe(`${ROOT}/Projects`);
    expect(vault.getFolder('folder-design')!.id).toBe('folder-design');
    expect(vault.getFolder('folder-design')!.path).toBe(`${ROOT}/Projects/Design`);
    expect(vault.getFolder('folder-design')!.parentId).toBe('folder-projects');
    expect(vault.getFolder('folder-design')!.metadata.status).toBe('active');
    expect(vault.getPage('page-notes')!.id).toBe('page-notes');
    expect(vault.getPage('page-notes')!.path).toBe(`${ROOT}/Projects/Design/Notes.md`);
    expect(vault.getPage('page-notes')!.metadata.status).toBe('active');
    expect(await fileSystem.exists(`${ROOT}/Projects/Design/Notes.md`)).toBe(true);
    expect(await fileSystem.exists(notes.path)).toBe(false);
  });

  it('throws when the restore destination path is already occupied, and does not touch disk or the Vault', async () => {
    const design = makeFolder('folder-design-existing', `${ROOT}/Projects/Design`, 'folder-projects');
    const projects = makeFolder('folder-projects', `${ROOT}/Projects`);
    const archived = makeArchivedFolder({
      id: 'folder-design',
      archivePath: `${ROOT}/Archive/Design`,
      originalPath: `${ROOT}/Projects/Design`,
      originalParentId: 'folder-projects',
    });
    const archiveFolder = makeArchiveFolder();
    const { vault, fileSystem, coordinator } = setup(
      [],
      [projects, design, archived, archiveFolder]
    );
    await fileSystem.createDirectory(design.path);
    await fileSystem.createDirectory(archived.path);

    await expect(
      coordinator.enqueue('folder-design', { kind: 'restore-folder' })
    ).rejects.toThrow(/Folder path already in use/);

    expect(vault.getFolder('folder-design')!.metadata.status).toBe('archived');
    expect(vault.getFolder('folder-design')!.path).toBe(archived.path);
    expect(await fileSystem.exists(archived.path)).toBe(true);
  });

  it('throws when the folder is not archived', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const archiveFolder = makeArchiveFolder();
    const { fileSystem, coordinator } = setup([], [folder, archiveFolder]);
    await fileSystem.createDirectory(folder.path);

    await expect(
      coordinator.enqueue('folder-1', { kind: 'restore-folder' })
    ).rejects.toThrow(/Folder is not archived: folder-1/);
  });

  it('throws when restoring an already-restored folder (second restore attempt)', async () => {
    const archived = makeArchivedFolder({
      id: 'folder-design',
      archivePath: `${ROOT}/Archive/Design`,
      originalPath: `${ROOT}/Projects/Design`,
      originalParentId: null,
    });
    const archiveFolder = makeArchiveFolder();
    const { fileSystem, coordinator } = setup([], [archived, archiveFolder]);
    await fileSystem.createDirectory(archived.path);

    await coordinator.enqueue('folder-design', { kind: 'restore-folder' });

    await expect(
      coordinator.enqueue('folder-design', { kind: 'restore-folder' })
    ).rejects.toThrow(/Folder is not archived: folder-design/);
  });

  it('abandons harmlessly for a folder id that no longer exists, without wedging the queue', async () => {
    const archiveFolder = makeArchiveFolder();
    const { vault, fileSystem, coordinator } = setup([], [archiveFolder]);

    const result = await coordinator.enqueue('does-not-exist', { kind: 'restore-folder' });

    expect(result.status).toBe('abandoned');

    const folder = makeFolder('folder-new', `${ROOT}/New`);
    vault.addFolder(folder);
    await fileSystem.createDirectory(folder.path);
    const followUp = await coordinator.enqueue('folder-new', { kind: 'archive-folder' });
    expect(followUp.status).toBe('folder-archived');
  });
});

// Mirrors PagePersistenceCoordinator.archiveFolder.test.ts's own
// disk-before-Vault / single-mutation / idempotent-retry suite exactly,
// one direction over — restore must carry the same guarantees archive
// already has.
describe('PagePersistenceCoordinator: folder restore is disk-before-Vault, single mutation', () => {
  it('writes the final .folder.md before vault.restoreFolder() commits — a failed write leaves the Vault untouched', async () => {
    const archived = makeArchivedFolder({
      id: 'folder-design',
      archivePath: `${ROOT}/Archive/Design`,
      originalPath: `${ROOT}/Projects/Design`,
      originalParentId: null,
    });
    const archiveFolder = makeArchiveFolder();
    const vault = makeVault([], [archived, archiveFolder]);
    const inner = new InMemoryVaultFileSystem();
    await inner.createDirectory(archived.path);

    class FailingMetadataWriteFileSystem implements VaultFileSystem {
      constructor(private readonly delegate: VaultFileSystem) {}

      exists(path: string) {
        return this.delegate.exists(path);
      }
      createDirectory(path: string) {
        return this.delegate.createDirectory(path);
      }
      readDirectory(path: string) {
        return this.delegate.readDirectory(path);
      }
      readFile(path: string) {
        return this.delegate.readFile(path);
      }
      async writeFile(path: string, contents: string): Promise<void> {
        if (path.endsWith('.folder.md')) {
          throw new Error('metadata write failed');
        }
        return this.delegate.writeFile(path, contents);
      }
      deleteFile(path: string) {
        return this.delegate.deleteFile(path);
      }
      moveFile(sourcePath: string, destinationPath: string) {
        return this.delegate.moveFile(sourcePath, destinationPath);
      }
      copyFile(sourceAbsolutePath: string, destinationAbsolutePath: string) {
        return this.delegate.copyFile(sourceAbsolutePath, destinationAbsolutePath);
      }
    }

    const fileSystem = new FailingMetadataWriteFileSystem(inner);
    const moveService = new MoveService(vault, fileSystem);
    const coordinator = new PagePersistenceCoordinator(
      fileSystem,
      vault,
      new FrontmatterSerializer(),
      new FrontmatterParser(),
      new PageRebuilder(),
      moveService
    );

    await expect(
      coordinator.enqueue('folder-design', { kind: 'restore-folder' })
    ).rejects.toThrow(/metadata write failed/);

    // No Vault mutation of any kind occurred.
    expect(vault.getFolder('folder-design')!.path).toBe(archived.path);
    expect(vault.getFolder('folder-design')!.metadata.status).toBe('archived');
  });

  it('notifies Vault subscribers exactly once for the whole restore-folder operation', async () => {
    const archived = makeArchivedFolder({
      id: 'folder-design',
      archivePath: `${ROOT}/Archive/Design`,
      originalPath: `${ROOT}/Projects/Design`,
      originalParentId: null,
    });
    const archiveFolder = makeArchiveFolder();
    const { vault, fileSystem, coordinator } = setup([], [archived, archiveFolder]);
    await fileSystem.createDirectory(archived.path);

    let notifyCount = 0;
    vault.subscribe(() => {
      notifyCount += 1;
    });

    await coordinator.enqueue('folder-design', { kind: 'restore-folder' });

    expect(notifyCount).toBe(1);
  });

  it('performs exactly one directory moveFile for a successful restore', async () => {
    const projects = makeFolder('folder-projects', `${ROOT}/Projects`);
    const archived = makeArchivedFolder({
      id: 'folder-design',
      archivePath: `${ROOT}/Archive/Design`,
      originalPath: `${ROOT}/Projects/Design`,
      originalParentId: 'folder-projects',
    });
    const archiveFolder = makeArchiveFolder();
    const vault = makeVault([], [projects, archived, archiveFolder]);
    const inner = new InMemoryVaultFileSystem();
    await inner.createDirectory(archived.path);

    class RecordingFileSystem implements VaultFileSystem {
      readonly moveCalls: string[] = [];
      constructor(private readonly delegate: VaultFileSystem) {}
      exists(path: string) {
        return this.delegate.exists(path);
      }
      createDirectory(path: string) {
        return this.delegate.createDirectory(path);
      }
      readDirectory(path: string) {
        return this.delegate.readDirectory(path);
      }
      readFile(path: string) {
        return this.delegate.readFile(path);
      }
      writeFile(path: string, contents: string) {
        return this.delegate.writeFile(path, contents);
      }
      deleteFile(path: string) {
        return this.delegate.deleteFile(path);
      }
      async moveFile(sourcePath: string, destinationPath: string): Promise<void> {
        this.moveCalls.push(`${sourcePath}->${destinationPath}`);
        return this.delegate.moveFile(sourcePath, destinationPath);
      }
      copyFile(sourceAbsolutePath: string, destinationAbsolutePath: string) {
        return this.delegate.copyFile(sourceAbsolutePath, destinationAbsolutePath);
      }
    }

    const fileSystem = new RecordingFileSystem(inner);
    const moveService = new MoveService(vault, fileSystem);
    const coordinator = new PagePersistenceCoordinator(
      fileSystem,
      vault,
      new FrontmatterSerializer(),
      new FrontmatterParser(),
      new PageRebuilder(),
      moveService
    );

    await coordinator.enqueue('folder-design', { kind: 'restore-folder' });

    expect(fileSystem.moveCalls).toEqual([
      `${ROOT}/Archive/Design->${ROOT}/Projects/Design`,
    ]);
  });

  // Mirrors archive-folder's own idempotent-retry coverage: a directory
  // move is a single atomic OS rename, so a retry after the Vault commit
  // failed on a prior attempt must recover (recognize the move already
  // happened via a matching persisted id) rather than getting stuck trying
  // to move a source that no longer exists.
  it('retrying after the Vault commit failed on a prior attempt recovers instead of getting stuck (idempotent move)', async () => {
    const projects = makeFolder('folder-projects', `${ROOT}/Projects`);
    const archived = makeArchivedFolder({
      id: 'folder-design',
      archivePath: `${ROOT}/Archive/Design`,
      originalPath: `${ROOT}/Projects/Design`,
      originalParentId: 'folder-projects',
    });
    const archiveFolder = makeArchiveFolder();
    const { vault, fileSystem, coordinator } = setup([], [projects, archived, archiveFolder]);
    await fileSystem.createDirectory(archived.path);
    await fileSystem.writeFile(`${archived.path}/.folder.md`, '---\nid: folder-design\nstatus: archived\n---\n');

    // Simulate the aftermath of a prior attempt that completed the move
    // and the corrected .folder.md write, but never reached
    // vault.restoreFolder().
    await fileSystem.moveFile(archived.path, `${ROOT}/Projects/Design`);
    await fileSystem.writeFile(
      `${ROOT}/Projects/Design/.folder.md`,
      '---\nid: folder-design\nstatus: active\n---\n'
    );

    const result = await coordinator.enqueue('folder-design', { kind: 'restore-folder' });

    expect(result.status).toBe('folder-restored');
    const restored = vault.getFolder('folder-design')!;
    expect(restored.path).toBe(`${ROOT}/Projects/Design`);
    expect(restored.metadata.status).toBe('active');
    expect(await fileSystem.exists(`${ROOT}/Projects/Design`)).toBe(true);
  });

  it('source missing + destination exists but identity cannot be proven (no .folder.md) fails safely, not silently', async () => {
    const archived = makeArchivedFolder({
      id: 'folder-design',
      archivePath: `${ROOT}/Archive/Design`,
      originalPath: `${ROOT}/Projects/Design`,
      originalParentId: null,
    });
    const archiveFolder = makeArchiveFolder();
    const { coordinator, fileSystem } = setup([], [archived, archiveFolder]);
    await fileSystem.createDirectory(archived.path);

    // Directory already sits at the destination (e.g. some other process),
    // but it never had a .folder.md, so identity cannot be proven.
    await fileSystem.moveFile(archived.path, `${ROOT}/Projects/Design`);

    await expect(
      coordinator.enqueue('folder-design', { kind: 'restore-folder' })
    ).rejects.toThrow();
  });
});
