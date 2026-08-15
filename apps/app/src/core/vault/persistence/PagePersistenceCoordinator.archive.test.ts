import { describe, expect, it } from 'vitest';
import { PagePersistenceCoordinator } from './PagePersistenceCoordinator';
import { MoveService } from './MoveService';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Page } from '../../vault/models/Page';
import type { Folder } from '../../vault/models/Folder';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

const ROOT = '/vault';
const ARCHIVE_FOLDER_ID = 'folder-archive';

function buildPage(): Page {
  const builder = new PageBuilder();
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/A.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'page-1' },
      frontmatterAnalysis: { aliases: [] },
      content: 'Page body',
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    },
  });
}

function makeArchiveFolder(): Folder {
  return {
    id: ARCHIVE_FOLDER_ID,
    name: 'Archive',
    path: `${ROOT}/Archive`,
    parentId: null,
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

function makeVault(pages: Page[], folders: Folder[] = []): Vault {
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

function setup(page: Page, folders: Folder[] = []) {
  const vault = makeVault([page], folders);
  const fileSystem = new InMemoryVaultFileSystem();
  fileSystem.seedFile(
    page.path,
    new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
  );
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

// A no-op VaultFileSystem wrapper that records which methods were called,
// in order — used to prove the operation performs a single atomic
// moveFile() rather than a write-then-delete pair.
class RecordingFileSystem implements VaultFileSystem {
  readonly calls: string[] = [];

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
    this.calls.push(`writeFile:${path}`);
    return this.delegate.writeFile(path, contents);
  }
  async deleteFile(path: string): Promise<void> {
    this.calls.push(`deleteFile:${path}`);
    return this.delegate.deleteFile(path);
  }
  async moveFile(sourcePath: string, destinationPath: string): Promise<void> {
    this.calls.push(`moveFile:${sourcePath}->${destinationPath}`);
    return this.delegate.moveFile(sourcePath, destinationPath);
  }
  copyFile(sourceAbsolutePath: string, destinationAbsolutePath: string) {
    return this.delegate.copyFile(sourceAbsolutePath, destinationAbsolutePath);
  }
}

describe('PagePersistenceCoordinator: archive moves the page on disk and in Vault', () => {
  it('moves the file on disk and updates vault path and parentId when archiving', async () => {
    const page = buildPage();
    const archiveFolder = makeArchiveFolder();
    const { vault, fileSystem, coordinator } = setup(page, [archiveFolder]);

    const result = await coordinator.enqueue(page.id, { kind: 'archive' });

    expect(result.status).toBe('saved');
    expect(fileSystem.hasFileSync(`${ROOT}/A.md`)).toBe(false);
    expect(fileSystem.hasFileSync(`${ROOT}/Archive/A.md`)).toBe(true);
    expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/Archive/A.md`);
    expect(vault.getPage(page.id)!.parentId).toBe(archiveFolder.id);
  });

  it('performs exactly one atomic moveFile, never a write-then-delete pair, for the relocation', async () => {
    const page = buildPage();
    const archiveFolder = makeArchiveFolder();
    const vault = makeVault([page], [archiveFolder]);
    const inner = new InMemoryVaultFileSystem();
    inner.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );
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

    await coordinator.enqueue(page.id, { kind: 'archive' });

    const moveCalls = fileSystem.calls.filter((call) => call.startsWith('moveFile:'));
    const deleteCalls = fileSystem.calls.filter((call) => call.startsWith('deleteFile:'));
    expect(moveCalls).toEqual([`moveFile:${ROOT}/A.md->${ROOT}/Archive/A.md`]);
    expect(deleteCalls).toEqual([]);
    // The relocating move happens before the frontmatter correction write.
    expect(fileSystem.calls).toEqual([
      `moveFile:${ROOT}/A.md->${ROOT}/Archive/A.md`,
      `writeFile:${ROOT}/Archive/A.md`,
    ]);
  });

  it('leaves vault and disk unchanged when the move itself fails', async () => {
    const page = buildPage();
    const archiveFolder = makeArchiveFolder();
    const vault = makeVault([page], [archiveFolder]);
    const inner = new InMemoryVaultFileSystem();
    inner.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );

    class FailingMoveFileSystem implements VaultFileSystem {
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
      async moveFile(): Promise<void> {
        throw new Error('move failed');
      }
      copyFile(sourceAbsolutePath: string, destinationAbsolutePath: string) {
        return this.delegate.copyFile(sourceAbsolutePath, destinationAbsolutePath);
      }
    }

    const fileSystem = new FailingMoveFileSystem(inner);
    const moveService = new MoveService(vault, fileSystem);
    const coordinator = new PagePersistenceCoordinator(
      fileSystem,
      vault,
      new FrontmatterSerializer(),
      new FrontmatterParser(),
      new PageRebuilder(),
      moveService
    );

    await expect(coordinator.enqueue(page.id, { kind: 'archive' })).rejects.toThrow(
      /move failed/
    );

    expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/A.md`);
    expect(vault.getPage(page.id)!.parentId).toBeNull();
    expect(vault.getPage(page.id)!.metadata.status).toBe('active');
    expect(inner.hasFileSync(`${ROOT}/A.md`)).toBe(true);
    expect(inner.hasFileSync(`${ROOT}/Archive/A.md`)).toBe(false);
  });

  // The move already succeeded (atomically) by the time the frontmatter
  // write fails, so disk is no longer untouched — the file is already at
  // the destination, just with stale (pre-archive) content. What must stay
  // true is the Vault invariant: no mutation occurred.
  it('leaves the Vault unchanged when the frontmatter write fails after a successful move', async () => {
    const page = buildPage();
    const archiveFolder = makeArchiveFolder();
    const vault = makeVault([page], [archiveFolder]);
    const inner = new InMemoryVaultFileSystem();
    inner.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );

    class FailingWriteFileSystem implements VaultFileSystem {
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
      async writeFile(): Promise<void> {
        throw new Error('write failed');
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

    const fileSystem = new FailingWriteFileSystem(inner);
    const moveService = new MoveService(vault, fileSystem);
    const coordinator = new PagePersistenceCoordinator(
      fileSystem,
      vault,
      new FrontmatterSerializer(),
      new FrontmatterParser(),
      new PageRebuilder(),
      moveService
    );

    await expect(coordinator.enqueue(page.id, { kind: 'archive' })).rejects.toThrow(
      /write failed/
    );

    // No Vault mutation of any kind occurred — disk-before-Vault ordering
    // means a failed write never reaches vault.replacePage() at all.
    expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/A.md`);
    expect(vault.getPage(page.id)!.parentId).toBeNull();
    expect(vault.getPage(page.id)!.metadata.status).toBe('active');
    // The move already succeeded — the file is at the destination, disk is
    // ahead of Vault, but there is exactly one physical copy (no duplicate
    // id/content risk the previous write-then-delete shape had).
    expect(inner.hasFileSync(`${ROOT}/A.md`)).toBe(false);
    expect(inner.hasFileSync(`${ROOT}/Archive/A.md`)).toBe(true);
  });

  it('retrying after a failed frontmatter write recovers instead of getting stuck (idempotent move)', async () => {
    const page = buildPage();
    const archiveFolder = makeArchiveFolder();
    const { vault, fileSystem, coordinator } = setup(page, [archiveFolder]);

    // Simulate the aftermath of the previous test by hand: the move already
    // happened, but the Vault was never updated (exactly the state a
    // failed frontmatter write would leave behind).
    await fileSystem.moveFile(`${ROOT}/A.md`, `${ROOT}/Archive/A.md`);

    const result = await coordinator.enqueue(page.id, { kind: 'archive' });

    expect(result.status).toBe('saved');
    expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/Archive/A.md`);
    expect(vault.getPage(page.id)!.parentId).toBe(archiveFolder.id);
    expect(vault.getPage(page.id)!.metadata.status).toBe('archived');
    expect(fileSystem.hasFileSync(`${ROOT}/Archive/A.md`)).toBe(true);
  });

  // Bare path existence is not proof of identity — these prove the
  // recovery guard actually reads and compares the destination's
  // persisted frontmatter id rather than trusting existence alone.
  describe('recovery requires proof of identity, not just path existence', () => {
    it('source missing + destination exists with the SAME id: recovery succeeds', async () => {
      const page = buildPage();
      const archiveFolder = makeArchiveFolder();
      const { vault, fileSystem, coordinator } = setup(page, [archiveFolder]);

      await fileSystem.moveFile(`${ROOT}/A.md`, `${ROOT}/Archive/A.md`);
      expect(
        (await fileSystem.readFile(`${ROOT}/Archive/A.md`)).includes(`id: ${page.id}`)
      ).toBe(true);

      const result = await coordinator.enqueue(page.id, { kind: 'archive' });

      expect(result.status).toBe('saved');
      expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/Archive/A.md`);
      expect(vault.getPage(page.id)!.metadata.status).toBe('archived');
    });

    it('source missing + destination exists with a DIFFERENT id: recovery does not occur, fails safely', async () => {
      const page = buildPage();
      const archiveFolder = makeArchiveFolder();
      const { vault, fileSystem, coordinator } = setup(page, [archiveFolder]);

      // The source is gone, and an unrelated file (a different page's
      // content, different id) already occupies the deterministic
      // destination — not our own prior move.
      await fileSystem.deleteFile(`${ROOT}/A.md`);
      await fileSystem.writeFile(
        `${ROOT}/Archive/A.md`,
        '---\nid: page-unrelated\n---\nSomeone else\'s content.'
      );

      await expect(
        coordinator.enqueue(page.id, { kind: 'archive' })
      ).rejects.toThrow();

      // The unrelated file's content was never touched or overwritten.
      expect(await fileSystem.readFile(`${ROOT}/Archive/A.md`)).toContain(
        'id: page-unrelated'
      );
      expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/A.md`);
      expect(vault.getPage(page.id)!.metadata.status).toBe('active');
    });

    it('destination exists but has malformed/missing frontmatter: fails safely, not treated as recovery', async () => {
      const page = buildPage();
      const archiveFolder = makeArchiveFolder();
      const { vault, fileSystem, coordinator } = setup(page, [archiveFolder]);

      await fileSystem.deleteFile(`${ROOT}/A.md`);
      // No frontmatter delimiters at all — FrontmatterParser returns an
      // empty frontmatter object rather than throwing, so `id` is simply
      // undefined; this must still be treated as "cannot confirm identity."
      await fileSystem.writeFile(`${ROOT}/Archive/A.md`, 'Not a real document.');

      await expect(
        coordinator.enqueue(page.id, { kind: 'archive' })
      ).rejects.toThrow();

      expect(await fileSystem.readFile(`${ROOT}/Archive/A.md`)).toBe(
        'Not a real document.'
      );
      expect(vault.getPage(page.id)!.metadata.status).toBe('active');
    });
  });
});

// The actual fix under test: archive() must never expose an intermediate
// Vault state where the page's path already says Archive/... but its
// status is still 'active' — the bug the ordering fix (runArchive's doc
// comment) closes. Previously this was two Vault mutations (movePage's
// updatePagePath, then writeParseRebuildReplace's replacePage); now it's
// one.
describe('PagePersistenceCoordinator: archive is a single atomic Vault mutation', () => {
  it('notifies Vault subscribers exactly once for the whole archive operation', async () => {
    const page = buildPage();
    const archiveFolder = makeArchiveFolder();
    const { vault, coordinator } = setup(page, [archiveFolder]);

    let notifyCount = 0;
    vault.subscribe(() => {
      notifyCount += 1;
    });

    await coordinator.enqueue(page.id, { kind: 'archive' });

    expect(notifyCount).toBe(1);
  });

  it('no observer ever sees the archived path with a still-active status', async () => {
    const page = buildPage();
    const archiveFolder = makeArchiveFolder();
    const { vault, coordinator } = setup(page, [archiveFolder]);

    const observedStates: Array<{ path: string; status: string }> = [];
    vault.subscribe(() => {
      const current = vault.getPage(page.id)!;
      observedStates.push({ path: current.path, status: current.metadata.status });
    });

    await coordinator.enqueue(page.id, { kind: 'archive' });

    expect(observedStates).toHaveLength(1);
    expect(observedStates[0]).toEqual({
      path: `${ROOT}/Archive/A.md`,
      status: 'archived',
    });
  });

  it('the final metadata matches the existing Archive contract exactly', async () => {
    const page = buildPage();
    const archiveFolder = makeArchiveFolder();
    const { vault, coordinator } = setup(page, [archiveFolder]);

    await coordinator.enqueue(page.id, { kind: 'archive' });

    const archived = vault.getPage(page.id)!;
    expect(archived.path).toBe(`${ROOT}/Archive/A.md`);
    expect(archived.parentId).toBe(archiveFolder.id);
    expect(archived.metadata.status).toBe('archived');
    expect(archived.metadata.archivedAt).not.toBeNull();
    expect(archived.metadata.originalPath).toBe(`${ROOT}/A.md`);
    expect(archived.metadata.originalParentId).toBeNull();
  });
});

// Lazy system-folder lifecycle: Archive is never eagerly created at
// startup anymore, so a missing Archive folder is an ordinary state (never
// materialized, or deleted externally) — the same self-healing shape
// Daily Notes already has, via the shared ensureReservedFolderForOperation
// helper, not an Archive-specific mechanism.
describe('PagePersistenceCoordinator: archive recovers a missing Archive folder', () => {
  it('recreates Archive on disk and in Vault, then archives the page successfully', async () => {
    const page = buildPage();
    const { vault, fileSystem, coordinator } = setup(page); // no Archive folder fixture
    expect(vault.getReservedFolder('archive')).toBeUndefined();

    const result = await coordinator.enqueue(page.id, { kind: 'archive' });

    expect(result.status).toBe('saved');
    const recreated = vault.getReservedFolder('archive');
    expect(recreated).toBeDefined();
    expect(recreated!.parentId).toBeNull();
    expect(await fileSystem.exists(`${ROOT}/Archive`)).toBe(true);
    expect(await fileSystem.exists(`${ROOT}/Archive/.folder.md`)).toBe(false);
    expect(vault.getPage(page.id)!.metadata.status).toBe('archived');
    expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/Archive/A.md`);
  });

  it('never creates a second Archive folder across two pages archived in sequence', async () => {
    const pageA = buildPage();
    const pageB: Page = { ...buildPage(), id: 'page-2', path: `${ROOT}/B.md`, name: 'B' };
    const vault = makeVault([pageA, pageB]);
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile(
      pageA.path,
      new FrontmatterSerializer().serializeDocument(pageA, pageA.source.markdown)
    );
    fileSystem.seedFile(
      pageB.path,
      new FrontmatterSerializer().serializeDocument(pageB, pageB.source.markdown)
    );
    const moveService = new MoveService(vault, fileSystem);
    const coordinator = new PagePersistenceCoordinator(
      fileSystem,
      vault,
      new FrontmatterSerializer(),
      new FrontmatterParser(),
      new PageRebuilder(),
      moveService
    );

    await coordinator.enqueue(pageA.id, { kind: 'archive' });
    const firstArchiveId = vault.getReservedFolder('archive')!.id;

    await coordinator.enqueue(pageB.id, { kind: 'archive' });
    const secondArchiveId = vault.getReservedFolder('archive')!.id;

    expect(secondArchiveId).toBe(firstArchiveId);
    expect(
      Array.from(vault.folders()).filter((folder) => folder.path === `${ROOT}/Archive`)
    ).toHaveLength(1);
  });
});
