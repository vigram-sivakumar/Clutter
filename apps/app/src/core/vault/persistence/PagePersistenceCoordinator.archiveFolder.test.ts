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

function makeFolder(id: string, path: string, parentId: string | null = null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: defaultFolderMetadata,
  };
}

function makeArchiveFolder(): Folder {
  return makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`, null);
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

describe('PagePersistenceCoordinator archive-folder vertical slice (ADR-026)', () => {
  it('moves an empty folder into Archive/ and persists the archived frontmatter', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const archiveFolder = makeArchiveFolder();
    const { vault, fileSystem, coordinator } = setup([], [folder, archiveFolder]);
    await fileSystem.createDirectory(folder.path);
    await fileSystem.writeFile(`${folder.path}/.folder.md`, '---\nid: folder-1\n---\n');

    const result = await coordinator.enqueue('folder-1', { kind: 'archive-folder' });

    expect(result.status).toBe('folder-archived');
    const archived = vault.getFolder('folder-1')!;
    expect(archived.path).toBe(`${ROOT}/Archive/Projects`);
    expect(archived.parentId).toBe(ARCHIVE_FOLDER_ID);
    expect(archived.metadata.status).toBe('archived');
    expect(archived.metadata.originalPath).toBe(`${ROOT}/Projects`);
    expect(archived.metadata.originalParentId).toBeNull();
    expect(await fileSystem.exists(`${ROOT}/Archive/Projects`)).toBe(true);
    expect(await fileSystem.exists(folder.path)).toBe(false);

    const written = await fileSystem.readFile(`${ROOT}/Archive/Projects/.folder.md`);
    expect(written).toContain('status: archived');
  });

  it('archives a folder with nested folders and pages as a single directory move, preserving ids and descendant metadata', async () => {
    const projects = makeFolder('folder-projects', `${ROOT}/Projects`);
    const design = makeFolder('folder-design', `${ROOT}/Projects/Design`, 'folder-projects');
    const notes = makePage('page-notes', `${ROOT}/Projects/Design/Notes.md`, 'folder-design');
    const archiveFolder = makeArchiveFolder();
    const { vault, fileSystem, coordinator } = setup(
      [notes],
      [projects, design, archiveFolder]
    );
    await fileSystem.createDirectory(design.path);
    await fileSystem.writeFile(notes.path, '# Notes');

    const result = await coordinator.enqueue('folder-projects', { kind: 'archive-folder' });

    expect(result.status).toBe('folder-archived');
    expect(vault.getFolder('folder-projects')!.path).toBe(`${ROOT}/Archive/Projects`);
    expect(vault.getFolder('folder-projects')!.metadata.status).toBe('archived');

    expect(vault.getFolder('folder-design')!.path).toBe(`${ROOT}/Archive/Projects/Design`);
    expect(vault.getFolder('folder-design')!.parentId).toBe('folder-projects');
    expect(vault.getFolder('folder-design')!.metadata.status).toBe('active');

    expect(vault.getPage('page-notes')!.path).toBe(
      `${ROOT}/Archive/Projects/Design/Notes.md`
    );
    expect(vault.getPage('page-notes')!.parentId).toBe('folder-design');
    expect(vault.getPage('page-notes')!.metadata.status).toBe('active');

    expect(await fileSystem.exists(`${ROOT}/Archive/Projects/Design/Notes.md`)).toBe(true);
    expect(await fileSystem.exists(notes.path)).toBe(false);
  });

  it('throws when the folder is already archived', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Archive/Projects`, ARCHIVE_FOLDER_ID);
    const archived: Folder = {
      ...folder,
      metadata: { ...defaultFolderMetadata, status: 'archived' },
    };
    const archiveFolder = makeArchiveFolder();
    const { fileSystem, coordinator } = setup([], [archived, archiveFolder]);
    await fileSystem.createDirectory(archived.path);

    await expect(
      coordinator.enqueue('folder-1', { kind: 'archive-folder' })
    ).rejects.toThrow(/Folder is already archived: folder-1/);
  });

  it('abandons harmlessly for a folder id that no longer exists, without wedging the queue', async () => {
    const archiveFolder = makeArchiveFolder();
    const { vault, fileSystem, coordinator } = setup([], [archiveFolder]);

    const result = await coordinator.enqueue('does-not-exist', { kind: 'archive-folder' });

    expect(result.status).toBe('abandoned');

    const folder = makeFolder('folder-new', `${ROOT}/New`);
    vault.addFolder(folder);
    await fileSystem.createDirectory(folder.path);
    const followUp = await coordinator.enqueue('folder-new', { kind: 'archive-folder' });
    expect(followUp.status).toBe('folder-archived');
  });
});

// The ordering fix under test: the final .folder.md must be written to the
// new physical destination before vault.archiveFolder() commits, and that
// commit must remain the single Vault mutation/notification it already was
// — never reading the Vault back merely to build the document (see
// runArchiveFolder's doc comment).
describe('PagePersistenceCoordinator: folder archive is disk-before-Vault, single mutation', () => {
  it('writes the final .folder.md before vault.archiveFolder() commits — a failed write leaves the Vault untouched', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const archiveFolder = makeArchiveFolder();
    const vault = makeVault([], [folder, archiveFolder]);
    const inner = new InMemoryVaultFileSystem();
    await inner.createDirectory(folder.path);

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
      coordinator.enqueue('folder-1', { kind: 'archive-folder' })
    ).rejects.toThrow(/metadata write failed/);

    // No Vault mutation of any kind occurred — the folder is still where
    // and what it was before the attempted archive.
    expect(vault.getFolder('folder-1')!.path).toBe(`${ROOT}/Projects`);
    expect(vault.getFolder('folder-1')!.parentId).toBeNull();
    expect(vault.getFolder('folder-1')!.metadata.status).toBe('active');
  });

  it('notifies Vault subscribers exactly once for the whole archive-folder operation', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const archiveFolder = makeArchiveFolder();
    const { vault, fileSystem, coordinator } = setup([], [folder, archiveFolder]);
    await fileSystem.createDirectory(folder.path);

    let notifyCount = 0;
    vault.subscribe(() => {
      notifyCount += 1;
    });

    await coordinator.enqueue('folder-1', { kind: 'archive-folder' });

    expect(notifyCount).toBe(1);
  });

  it('performs exactly one directory moveFile for a successful archive', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const archiveFolder = makeArchiveFolder();
    const vault = makeVault([], [folder, archiveFolder]);
    const inner = new InMemoryVaultFileSystem();
    await inner.createDirectory(folder.path);

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

    await coordinator.enqueue('folder-1', { kind: 'archive-folder' });

    expect(fileSystem.moveCalls).toEqual([`${ROOT}/Projects->${ROOT}/Archive/Projects`]);
  });

  // The failure case identified in review: a directory move is a single
  // atomic OS rename, so there is nothing to roll back if the Vault commit
  // fails afterward — the move (and, in this scenario, the .folder.md
  // write) already fully happened. What broke recovery before this fix is
  // that a retry still tried to move a source that no longer existed
  // (Vault's stale, pre-move belief). Recovery requires proof of identity
  // (a matching persisted id in the destination's .folder.md, not just the
  // directory's existence) — so this simulates the narrow window where
  // *everything* except the Vault commit already completed, the only
  // shape recovery is meant to cover.
  it('retrying after the Vault commit failed on a prior attempt recovers instead of getting stuck (idempotent move)', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const archiveFolder = makeArchiveFolder();
    const { vault, fileSystem, coordinator } = setup([], [folder, archiveFolder]);
    await fileSystem.createDirectory(folder.path);
    await fileSystem.writeFile(`${folder.path}/.folder.md`, '---\nid: folder-1\n---\n');

    // Simulate the aftermath of a prior attempt that completed the move
    // and the corrected .folder.md write, but never reached vault.archiveFolder().
    await fileSystem.moveFile(`${ROOT}/Projects`, `${ROOT}/Archive/Projects`);
    await fileSystem.writeFile(
      `${ROOT}/Archive/Projects/.folder.md`,
      '---\nid: folder-1\nstatus: archived\n---\n'
    );

    const result = await coordinator.enqueue('folder-1', { kind: 'archive-folder' });

    expect(result.status).toBe('folder-archived');
    const archived = vault.getFolder('folder-1')!;
    expect(archived.path).toBe(`${ROOT}/Archive/Projects`);
    expect(archived.parentId).toBe(ARCHIVE_FOLDER_ID);
    expect(archived.metadata.status).toBe('archived');
    expect(await fileSystem.exists(`${ROOT}/Archive/Projects`)).toBe(true);
  });

  it('descendants retain their existing metadata/status after a recovered retry', async () => {
    const projects = makeFolder('folder-projects', `${ROOT}/Projects`);
    const design = makeFolder('folder-design', `${ROOT}/Projects/Design`, 'folder-projects');
    const notes = makePage('page-notes', `${ROOT}/Projects/Design/Notes.md`, 'folder-design');
    const archiveFolder = makeArchiveFolder();
    const { vault, fileSystem, coordinator } = setup(
      [notes],
      [projects, design, archiveFolder]
    );
    await fileSystem.createDirectory(design.path);
    await fileSystem.writeFile(notes.path, '# Notes');
    await fileSystem.writeFile(`${projects.path}/.folder.md`, '---\nid: folder-projects\n---\n');

    // Simulate the aftermath of a prior attempt that completed the move
    // (relocating the whole subtree) and the corrected .folder.md write,
    // but never reached vault.archiveFolder().
    await fileSystem.moveFile(projects.path, `${ROOT}/Archive/Projects`);
    await fileSystem.writeFile(
      `${ROOT}/Archive/Projects/.folder.md`,
      '---\nid: folder-projects\nstatus: archived\n---\n'
    );

    const result = await coordinator.enqueue('folder-projects', { kind: 'archive-folder' });

    expect(result.status).toBe('folder-archived');
    expect(vault.getFolder('folder-projects')!.metadata.status).toBe('archived');
    expect(vault.getFolder('folder-design')!.metadata.status).toBe('active');
    expect(vault.getPage('page-notes')!.metadata.status).toBe('active');
  });

  it('source missing + destination exists but identity cannot be proven (no .folder.md) fails safely, not silently', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const archiveFolder = makeArchiveFolder();
    const { coordinator, fileSystem } = setup([], [folder, archiveFolder]);
    await fileSystem.createDirectory(folder.path);

    // Directory already moved (e.g. by some other process), but it never
    // had a .folder.md, so there is no way to prove it's the same folder.
    await fileSystem.moveFile(folder.path, `${ROOT}/Archive/Projects`);

    await expect(
      coordinator.enqueue('folder-1', { kind: 'archive-folder' })
    ).rejects.toThrow(/path not found/i);
  });

  it('an existing destination belonging to a different folder is never treated as the previous move', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const archiveFolder = makeArchiveFolder();
    const { coordinator, fileSystem } = setup([], [folder, archiveFolder]);
    await fileSystem.createDirectory(folder.path);

    // An unrelated folder already occupies the deterministic destination,
    // with its own distinct persisted id.
    await fileSystem.moveFile(folder.path, `${ROOT}/Archive/Projects`);
    await fileSystem.writeFile(
      `${ROOT}/Archive/Projects/.folder.md`,
      '---\nid: some-other-folder\n---\n'
    );

    await expect(
      coordinator.enqueue('folder-1', { kind: 'archive-folder' })
    ).rejects.toThrow(/path not found/i);
  });
});
