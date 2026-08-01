import { describe, expect, it } from 'vitest';
import { PersistenceService } from './PersistenceService';
import { PagePersistenceCoordinator } from './PagePersistenceCoordinator';
import { PageMutationService } from '../page/PageMutationService';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { DocumentSession } from '../../engine/DocumentSession';
import { DocumentTransaction } from '../../engine/DocumentTransaction';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/understand/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/understand/FrontmatterParser';
import { PageRebuilder } from '../../vault/build/PageRebuilder';
import { MoveService } from '../move/MoveService';
import { PageBuilder } from '../../vault/build/PageBuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Page } from '../../vault/models/Page';
import type { Folder } from '../../vault/models/Folder';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

const ROOT = '/vault';
const ARCHIVE_FOLDER_ID = 'folder-archive';

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

function makeArchiveFolder(): Folder {
  return {
    id: ARCHIVE_FOLDER_ID,
    name: 'Archive',
    path: `${ROOT}/Archive`,
    parentId: null,
    metadata: defaultFolderMetadata,
  };
}

function archivePathFor(page: Page): string {
  const filename = page.path.slice(page.path.lastIndexOf('/') + 1);
  return `${ROOT}/Archive/${filename}`;
}

function buildPage(): Page {
  const builder = new PageBuilder();
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/Note.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'page-1' },
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
}

function makeVault(pages: Page[]): Vault {
  return new Vault(
    ROOT,
    pages,
    [makeArchiveFolder()],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

/** Delays every writeFile call and records the order writes were made in. */
class SlowWriteFileSystem implements VaultFileSystem {
  public writeCallOrder: string[] = [];

  constructor(private readonly inner: VaultFileSystem, private readonly delayMs: number) {}

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
    this.writeCallOrder.push(contents);
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    await this.inner.writeFile(path, contents);
  }
}

/**
 * PersistenceService (edits) and PageMutationService (archive/rename/move)
 * are two independently-instantiated services, but as of PagePersistenceCoordinator
 * they now share a single injected coordinator instance, which owns the one
 * per-page write queue for both. This test proves that sharing closes the
 * write race previously demonstrated here: a concurrent edit-save and
 * archive on the same page no longer clobber each other, because the second
 * operation to be enqueued always builds on the first operation's already
 * committed result rather than a stale snapshot.
 */
describe('Persistence duplication risk: PersistenceService vs PageMutationService (fixed via shared PagePersistenceCoordinator)', () => {
  it('FIXED: a concurrent edit-save and archive on the same page both apply — content updates and archived status survives', async () => {
    const page = buildPage();
    const vault = makeVault([page]);
    const sharedStorage = new InMemoryVaultFileSystem();
    sharedStorage.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );

    // The underlying write is slow (simulates a large file / slow disk) to
    // prove archivePage() genuinely waits its turn rather than happening to
    // finish first by coincidence.
    const slowFileSystem = new SlowWriteFileSystem(sharedStorage, 20);
    const saveCoordinator = new SaveCoordinator();

    // A single coordinator instance is now shared by both services, exactly
    // as Application's composition root wires it.
    const moveService = new MoveService(vault, slowFileSystem);
    const coordinator = new PagePersistenceCoordinator(
      slowFileSystem,
      vault,
      new FrontmatterSerializer(),
      new FrontmatterParser(),
      new PageRebuilder(),
      moveService
    );
    const persistenceService = new PersistenceService(coordinator, saveCoordinator);
    const pageMutationService = new PageMutationService(coordinator);

    const session = new DocumentSession(page);
    session.commit(new DocumentTransaction('Edited body'));
    saveCoordinator.beginSave(session);
    const revision = session.currentRevision;

    // Enqueue the edit save first but don't await it yet.
    const editSave = persistenceService.save(session, revision);

    // Immediately request an archive on the same page. Because both
    // services delegate to the same coordinator, this must queue behind the
    // in-flight edit save rather than racing it.
    const archive = pageMutationService.archivePage(page.id);

    await Promise.all([editSave, archive]);

    // Both writes actually happened, in enqueue order.
    expect(slowFileSystem.writeCallOrder).toHaveLength(2);
    expect(slowFileSystem.writeCallOrder[0]).toContain('Edited body');

    // The archive's write (second in the queue) was built from the Vault's
    // post-edit page, so it preserves the new content while adding the
    // archived status — neither operation is silently discarded.
    const finalPage = vault.getPage(page.id)!;
    const archivePath = archivePathFor(page);
    const finalDisk = await sharedStorage.readFile(archivePath);

    expect(finalPage.path).toBe(archivePath);
    expect(finalPage.source.markdown).toBe('Edited body');
    expect(finalPage.metadata.status).toBe('archived');
    expect(finalPage.metadata.archivedAt).not.toBeNull();
    expect(finalDisk).toContain('Edited body');
    expect(finalDisk).toMatch(/status:\s*archived/);
    expect(sharedStorage.hasFileSync(page.path)).toBe(false);
  });

  it('a markdown edit saved after archiving preserves status and archivedAt while updating content', async () => {
    const page = buildPage();
    const vault = makeVault([page]);
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );
    const saveCoordinator = new SaveCoordinator();
    const moveService = new MoveService(vault, fileSystem);
    const coordinator = new PagePersistenceCoordinator(
      fileSystem,
      vault,
      new FrontmatterSerializer(),
      new FrontmatterParser(),
      new PageRebuilder(),
      moveService
    );
    const persistenceService = new PersistenceService(coordinator, saveCoordinator);
    const pageMutationService = new PageMutationService(coordinator);

    await pageMutationService.archivePage(page.id);
    const archivedPage = vault.getPage(page.id)!;
    expect(archivedPage.metadata.status).toBe('archived');
    const archivedAt = archivedPage.metadata.archivedAt;
    expect(archivedAt).not.toBeNull();

    // Open a session on the now-archived page and save a content-only edit.
    const session = new DocumentSession(archivedPage);
    session.commit(new DocumentTransaction('Edited after archiving'));
    saveCoordinator.beginSave(session);
    const revision = session.currentRevision;

    await persistenceService.save(session, revision);

    const finalPage = vault.getPage(page.id)!;
    expect(finalPage.source.markdown).toBe('Edited after archiving');
    expect(finalPage.metadata.status).toBe('archived');
    expect(finalPage.metadata.archivedAt).toBe(archivedAt);
  });
});
