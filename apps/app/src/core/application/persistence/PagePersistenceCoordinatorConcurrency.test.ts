import { describe, expect, it } from 'vitest';
import { PagePersistenceCoordinator } from './PagePersistenceCoordinator';
import { MoveService } from '../move/MoveService';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Page } from '../../vault/models/Page';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

const ROOT = '/vault';

/** Delays every writeFile call and records the order writes were made in. */
class SlowWriteFileSystem implements VaultFileSystem {
  public writeCallOrder: string[] = [];

  constructor(
    private readonly inner: VaultFileSystem,
    private readonly delayMs: number
  ) {}

  exists(path: string) {
    return this.inner.exists(path);
  }
  createDirectory(path: string) {
    return this.inner.createDirectory(path);
  }
  readDirectory(path: string) {
    return this.inner.readDirectory(path);
  }
  readFile(path: string) {
    return this.inner.readFile(path);
  }
  deleteFile(path: string) {
    return this.inner.deleteFile(path);
  }
  moveFile(sourcePath: string, destinationPath: string) {
    return this.inner.moveFile(sourcePath, destinationPath);
  }

  async writeFile(path: string, contents: string): Promise<void> {
    this.writeCallOrder.push(path);
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    await this.inner.writeFile(path, contents);
  }
}

function makeVault(pages: Page[] = []): Vault {
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

function noteDocument(id: string, body: string): string {
  return `---\nid: ${id}\n---\n${body}`;
}

function setup(pages: Page[] = [], fileSystem?: VaultFileSystem) {
  const vault = makeVault(pages);
  const resolvedFileSystem = fileSystem ?? new InMemoryVaultFileSystem();
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

/**
 * Spec §5's own testing strategy names this as the property that matters
 * most: operations for the same pageId execute strictly in enqueue order;
 * operations for different pageIds never block each other. Commits 1-3
 * each proved their own kind in isolation — this proves the mix, which is
 * genuinely new coverage since 'create'/'delete' didn't exist to combine
 * with 'save' until now.
 */
describe('PagePersistenceCoordinator cross-kind concurrency', () => {
  it('create immediately followed by save on the same freshly-created id applies both writes in order', async () => {
    const { vault, coordinator } = setup();

    const createResult = await coordinator.enqueue('page-new', {
      kind: 'create',
      path: `${ROOT}/New.md`,
      parentId: null,
      content: noteDocument('page-new', 'Initial body'),
    });
    expect(createResult.status).toBe('saved');

    const saveResult = await coordinator.enqueue('page-new', {
      kind: 'save',
      content: 'Edited body',
    });
    expect(saveResult.status).toBe('saved');

    expect(vault.getPage('page-new')!.source.markdown).toBe('Edited body');
  });

  it('create immediately followed by delete on the same id resolves in order, leaving no trace', async () => {
    const { vault, fileSystem, coordinator } = setup();

    const createPromise = coordinator.enqueue('page-new', {
      kind: 'create',
      path: `${ROOT}/New.md`,
      parentId: null,
      content: noteDocument('page-new', 'Will be deleted'),
    });
    const deletePromise = coordinator.enqueue('page-new', { kind: 'delete' });

    const [createResult, deleteResult] = await Promise.all([
      createPromise,
      deletePromise,
    ]);

    // The create must fully land in the Vault before the delete's lookup
    // runs, or the delete would spuriously abandon (no page to delete yet).
    expect(createResult.status).toBe('saved');
    expect(deleteResult.status).toBe('deleted');
    expect(vault.getPage('page-new')).toBeUndefined();
    expect((fileSystem as InMemoryVaultFileSystem).hasFileSync(`${ROOT}/New.md`)).toBe(
      false
    );
  });

  it('a save for one page and a create for another do not block each other', async () => {
    const existing = new PageBuilder().build({
      parentId: null,
      page: {
        path: `${ROOT}/Existing.md`,
        directoryPath: ROOT,
        frontmatter: { id: 'existing-page' },
        frontmatterAnalysis: { aliases: [] },
        content: 'Original body',
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

    const inner = new InMemoryVaultFileSystem();
    inner.seedFile(
      existing.path,
      new FrontmatterSerializer().serializeDocument(existing, existing.source.markdown)
    );

    // The save's write is slow; if create were queued behind it (wrongly
    // sharing a lock across different pageIds), the create's write would
    // start only after the save's write starts, in strict order. Instead
    // both dispatch immediately since they key on different pageIds.
    const slowFileSystem = new SlowWriteFileSystem(inner, 20);
    const { vault, coordinator } = setup([existing], slowFileSystem);

    const savePromise = coordinator.enqueue('existing-page', {
      kind: 'save',
      content: 'Edited body',
    });
    const createPromise = coordinator.enqueue('page-new', {
      kind: 'create',
      path: `${ROOT}/New.md`,
      parentId: null,
      content: noteDocument('page-new', 'Brand new body'),
    });

    const [saveResult, createResult] = await Promise.all([savePromise, createPromise]);

    expect(saveResult.status).toBe('saved');
    expect(createResult.status).toBe('saved');
    // Both writes were issued before either finished — proof they ran
    // concurrently rather than one waiting for the other's per-page queue.
    expect(slowFileSystem.writeCallOrder).toContain(`${ROOT}/Existing.md`);
    expect(slowFileSystem.writeCallOrder).toContain(`${ROOT}/New.md`);
    expect(vault.getPage('existing-page')!.source.markdown).toBe('Edited body');
    expect(vault.getPage('page-new')!.source.markdown).toBe('Brand new body');
  });
});
