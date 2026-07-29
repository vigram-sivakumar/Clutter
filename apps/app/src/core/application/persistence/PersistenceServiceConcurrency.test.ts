import { describe, expect, it } from 'vitest';
import { PersistenceService } from './PersistenceService';
import { PagePersistenceCoordinator } from './PagePersistenceCoordinator';
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
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

const ROOT = '/vault';

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
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

/**
 * Wraps a VaultFileSystem so writeFile calls can be released on demand,
 * letting a test control exactly how two in-flight writes interleave
 * instead of relying on incidental microtask scheduling.
 */
class GatedFileSystem implements VaultFileSystem {
  private readonly gates: Array<() => void> = [];
  public writeCallOrder: string[] = [];

  constructor(private readonly inner: VaultFileSystem) {}

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
    await new Promise<void>((resolve) => this.gates.push(resolve));
    await this.inner.writeFile(path, contents);
  }

  releaseNextGate(): void {
    const gate = this.gates.shift();
    if (gate) gate();
  }
}

describe('PersistenceService concurrent saves on the same page', () => {
  it('writes disk content in call order and the vault ends up reflecting the last write to settle', async () => {
    const page = buildPage();
    const vault = makeVault([page]);
    const inner = new InMemoryVaultFileSystem();
    const fileSystem = new GatedFileSystem(inner);
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
    const session = new DocumentSession(page);

    session.commit(new DocumentTransaction('Revision A'));
    saveCoordinator.beginSave(session);
    const revisionA = session.currentRevision;
    const saveA = persistenceService.save(session, revisionA);

    session.commit(new DocumentTransaction('Revision B'));
    saveCoordinator.beginSave(session);
    const revisionB = session.currentRevision;
    const saveB = persistenceService.save(session, revisionB);

    // Release each write's gate as soon as it is registered, without
    // assuming how many microtask turns it takes to appear. This lets the
    // two writes interleave however PersistenceService actually schedules
    // them, rather than forcing an assumed order that could deadlock if the
    // scheduling doesn't match.
    for (let i = 0; i < 2; i++) {
      // Give any pending microtask (e.g. enqueueSave's .then chain) a turn
      // to run and register its gate before we try to release it.
      await new Promise((resolve) => setTimeout(resolve, 0));
      fileSystem.releaseNextGate();
    }

    await Promise.all([saveA, saveB]);

    // Disk ordering is guaranteed by enqueueSave: A's write happens before B's.
    expect(fileSystem.writeCallOrder[0]).toContain('Revision A');
    expect(fileSystem.writeCallOrder[1]).toContain('Revision B');

    const finalDisk = await inner.readFile(page.path);
    const finalVaultContent = vault.getPage(page.id)!.source.markdown;

    // Report actual observed behavior rather than assuming correctness:
    // disk is expected to hold B (last write wins on disk).
    expect(finalDisk).toContain('Revision B');

    // This assertion documents the invariant we WANT: the vault's in-memory
    // page should match the last-written (newest) revision, not regress to
    // an earlier one. If PersistenceService's post-write vault.replacePage()
    // calls settle out of write order, this assertion will fail and expose
    // the gap named in the architecture review (no re-check of staleness
    // after the awaited write, and no ordering guarantee on replacePage()
    // itself).
    expect(finalVaultContent).toBe('Revision B');

    expect(session.isDirty).toBe(false);
    expect(session.savedRevision).toBe(revisionB);
  });

  it('a stale completion does not mark the session saved with an old revision', async () => {
    const page = buildPage();
    const vault = makeVault([page]);
    const fileSystem = new InMemoryVaultFileSystem();
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
    const session = new DocumentSession(page);

    session.commit(new DocumentTransaction('Revision A'));
    saveCoordinator.beginSave(session);
    const revisionA = session.currentRevision;
    const saveA = persistenceService.save(session, revisionA);

    session.commit(new DocumentTransaction('Revision B'));
    saveCoordinator.beginSave(session);
    const revisionB = session.currentRevision;
    const saveB = persistenceService.save(session, revisionB);

    await Promise.all([saveA, saveB]);

    // SaveCoordinator's activeSaves guard should ensure the session is only
    // ever marked saved with the newest revision, never regressed to A.
    expect(session.savedRevision).toBe(revisionB);
    expect(session.savedRevision).not.toBe(revisionA);
  });
});
