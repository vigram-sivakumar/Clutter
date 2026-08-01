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

class DirectoryTrackingFileSystem implements VaultFileSystem {
  readonly createDirectoryCalls: string[] = [];

  constructor(private readonly inner: InMemoryVaultFileSystem) {}

  exists(path: string) {
    return this.inner.exists(path);
  }

  async createDirectory(path: string): Promise<void> {
    this.createDirectoryCalls.push(path);
    return this.inner.createDirectory(path);
  }

  readDirectory(path: string) {
    return this.inner.readDirectory(path);
  }

  readFile(path: string) {
    return this.inner.readFile(path);
  }

  writeFile(path: string, contents: string) {
    return this.inner.writeFile(path, contents);
  }

  deleteFile(path: string) {
    return this.inner.deleteFile(path);
  }

  moveFile(sourcePath: string, destinationPath: string) {
    return this.inner.moveFile(sourcePath, destinationPath);
  }

  hasFileSync(path: string): boolean {
    return this.inner.hasFileSync(path);
  }
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

/**
 * Phase 1 has no standalone `move` kind (no caller/business-rule owner
 * exists yet — see ADR-011). These scenarios exercise the same underlying
 * mechanism — PagePersistenceCoordinator delegating a path/parentId change
 * to MoveService mid-dispatch — through the `archive` kind, which is the
 * one real caller of that mechanism in Phase 1.
 */
describe('PagePersistenceCoordinator move-on-structural-change (via the archive kind)', () => {
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

  it('leaves vault path unchanged when moveFile throws', async () => {
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
    expect(inner.hasFileSync(`${ROOT}/A.md`)).toBe(true);
    expect(inner.hasFileSync(`${ROOT}/Archive/A.md`)).toBe(false);
  });

  it('archives the page when the destination directory does not exist yet', async () => {
    const page = buildPage();
    const archiveFolder = makeArchiveFolder();
    const vault = makeVault([page], [archiveFolder]);
    const inner = new InMemoryVaultFileSystem();
    inner.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );

    const fileSystem = new DirectoryTrackingFileSystem(inner);
    const moveService = new MoveService(vault, fileSystem);
    const coordinator = new PagePersistenceCoordinator(
      fileSystem,
      vault,
      new FrontmatterSerializer(),
      new FrontmatterParser(),
      new PageRebuilder(),
      moveService
    );

    expect(await inner.exists(`${ROOT}/Archive`)).toBe(false);

    const result = await coordinator.enqueue(page.id, { kind: 'archive' });

    expect(result.status).toBe('saved');
    expect(fileSystem.createDirectoryCalls).toEqual([`${ROOT}/Archive`]);
    expect(fileSystem.hasFileSync(`${ROOT}/A.md`)).toBe(false);
    expect(fileSystem.hasFileSync(`${ROOT}/Archive/A.md`)).toBe(true);
    expect(vault.getPageByPath(`${ROOT}/Archive/A.md`)?.id).toBe(page.id);
    expect(vault.getPageByPath(`${ROOT}/A.md`)).toBeUndefined();
    expect(vault.getPage(page.id)!.parentId).toBe(archiveFolder.id);
  });
});
