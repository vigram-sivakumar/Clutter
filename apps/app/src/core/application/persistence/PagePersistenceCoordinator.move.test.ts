import { describe, expect, it } from 'vitest';
import { PagePersistenceCoordinator } from './PagePersistenceCoordinator';
import { MoveService } from '../move/MoveService';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/understand/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/understand/FrontmatterParser';
import { PageRebuilder } from '../../vault/build/PageRebuilder';
import { PageBuilder } from '../../vault/build/PageBuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Page } from '../../vault/models/Page';
import type { Folder } from '../../vault/models/Folder';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

const ROOT = '/vault';

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

function makeFolder(): Folder {
  return {
    id: 'folder-1',
    name: 'Folder',
    path: `${ROOT}/Folder`,
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

function makeNewFolder(): Folder {
  return {
    id: 'new-folder-1',
    name: 'NewFolder',
    path: `${ROOT}/NewFolder`,
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

describe('PagePersistenceCoordinator page move vertical slice', () => {
  it('moves the file on disk and updates vault path and parentId when operate changes location', async () => {
    const page = buildPage();
    const folder = makeFolder();
    const { vault, fileSystem, coordinator } = setup(page, [folder]);

    const result = await coordinator.enqueue(page.id, (current) => ({
      page: {
        ...current,
        path: `${ROOT}/Folder/A.md`,
        parentId: folder.id,
      },
      markdown: current.source.markdown,
    }));

    expect(result.status).toBe('saved');
    expect(fileSystem.hasFileSync(`${ROOT}/A.md`)).toBe(false);
    expect(fileSystem.hasFileSync(`${ROOT}/Folder/A.md`)).toBe(true);
    expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/Folder/A.md`);
    expect(vault.getPage(page.id)!.parentId).toBe(folder.id);
  });

  it('leaves vault path unchanged when moveFile throws', async () => {
    const page = buildPage();
    const folder = makeFolder();
    const vault = makeVault([page], [folder]);
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

    await expect(
      coordinator.enqueue(page.id, (current) => ({
        page: {
          ...current,
          path: `${ROOT}/Folder/A.md`,
          parentId: folder.id,
        },
        markdown: current.source.markdown,
      }))
    ).rejects.toThrow(/move failed/);

    expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/A.md`);
    expect(vault.getPage(page.id)!.parentId).toBeNull();
    expect(inner.hasFileSync(`${ROOT}/A.md`)).toBe(true);
    expect(inner.hasFileSync(`${ROOT}/Folder/A.md`)).toBe(false);
  });

  it('moves the page when the destination directory does not exist yet', async () => {
    const page = buildPage();
    const newFolder = makeNewFolder();
    const vault = makeVault([page], [newFolder]);
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

    expect(await inner.exists(`${ROOT}/NewFolder`)).toBe(false);

    const result = await coordinator.enqueue(page.id, (current) => ({
      page: {
        ...current,
        path: `${ROOT}/NewFolder/A.md`,
        parentId: newFolder.id,
      },
      markdown: current.source.markdown,
    }));

    expect(result.status).toBe('saved');
    expect(fileSystem.createDirectoryCalls).toEqual([`${ROOT}/NewFolder`]);
    expect(fileSystem.hasFileSync(`${ROOT}/A.md`)).toBe(false);
    expect(fileSystem.hasFileSync(`${ROOT}/NewFolder/A.md`)).toBe(true);
    expect(vault.getPageByPath(`${ROOT}/NewFolder/A.md`)?.id).toBe(page.id);
    expect(vault.getPageByPath(`${ROOT}/A.md`)).toBeUndefined();
    expect(vault.getPage(page.id)!.parentId).toBe(newFolder.id);
  });
});
