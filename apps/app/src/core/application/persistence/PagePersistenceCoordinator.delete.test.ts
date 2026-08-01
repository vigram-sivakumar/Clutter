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
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

const ROOT = '/vault';

function buildPage(id = 'page-1', path = `${ROOT}/Note.md`): Page {
  const builder = new PageBuilder();
  return builder.build({
    parentId: null,
    page: {
      path,
      directoryPath: ROOT,
      frontmatter: { id },
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

function makeVault(pages: Page[]): Vault {
  return new Vault(
    ROOT,
    pages,
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

function setup(page: Page, fileSystem?: VaultFileSystem) {
  const vault = makeVault([page]);
  const resolvedFileSystem = fileSystem ?? new InMemoryVaultFileSystem();

  if (resolvedFileSystem instanceof InMemoryVaultFileSystem) {
    resolvedFileSystem.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );
  }

  const moveService = new MoveService(vault, resolvedFileSystem);
  const coordinator = new PagePersistenceCoordinator(
    resolvedFileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService
  );

  return { vault, fileSystem: resolvedFileSystem, coordinator };
}

describe('PagePersistenceCoordinator delete vertical slice', () => {
  it('deletes the file from disk and removes the page from the vault', async () => {
    const page = buildPage();
    const { vault, fileSystem, coordinator } = setup(page);

    const result = await coordinator.enqueue(page.id, { kind: 'delete' });

    expect(result.status).toBe('deleted');
    expect((fileSystem as InMemoryVaultFileSystem).hasFileSync(page.path)).toBe(false);
    expect(vault.getPage(page.id)).toBeUndefined();
  });

  it('abandons the operation for an unknown page id, without touching disk', async () => {
    const page = buildPage();
    const { fileSystem, coordinator } = setup(page);

    const result = await coordinator.enqueue('does-not-exist', { kind: 'delete' });

    expect(result.status).toBe('abandoned');
    expect((fileSystem as InMemoryVaultFileSystem).hasFileSync(page.path)).toBe(true);
  });

  it('enqueues a save then a delete for the same page and resolves them in order with a consistent final state', async () => {
    const page = buildPage();
    const { vault, fileSystem, coordinator } = setup(page);

    const savePromise = coordinator.enqueue(page.id, {
      kind: 'save',
      content: 'Edited before deletion',
    });
    const deletePromise = coordinator.enqueue(page.id, { kind: 'delete' });

    const [saveResult, deleteResult] = await Promise.all([savePromise, deletePromise]);

    expect(saveResult.status).toBe('saved');
    expect(deleteResult.status).toBe('deleted');
    expect(vault.getPage(page.id)).toBeUndefined();
    expect((fileSystem as InMemoryVaultFileSystem).hasFileSync(page.path)).toBe(false);
  });

  it('a delete failure leaves the per-page queue free for the next operation', async () => {
    const page = buildPage();
    const inner = new InMemoryVaultFileSystem();
    inner.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );

    class FailOnceDeleteFileSystem implements VaultFileSystem {
      private failNext = true;
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
      moveFile(sourcePath: string, destinationPath: string) {
        return this.delegate.moveFile(sourcePath, destinationPath);
      }
      async deleteFile(path: string): Promise<void> {
        if (this.failNext) {
          this.failNext = false;
          throw new Error('delete failed');
        }
        return this.delegate.deleteFile(path);
      }
    }

    const fileSystem = new FailOnceDeleteFileSystem(inner);
    const { vault, coordinator } = setup(page, fileSystem);

    await expect(coordinator.enqueue(page.id, { kind: 'delete' })).rejects.toThrow(
      /delete failed/
    );
    expect(vault.getPage(page.id)).toBeDefined();

    // The queue is not wedged by the failed delete — a subsequent save for
    // the same page still runs.
    const saveResult = await coordinator.enqueue(page.id, {
      kind: 'save',
      content: 'Still editable after a failed delete',
    });
    expect(saveResult.status).toBe('saved');
    expect(vault.getPage(page.id)!.source.markdown).toBe(
      'Still editable after a failed delete'
    );
  });
});
