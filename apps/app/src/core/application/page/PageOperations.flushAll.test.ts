import { describe, expect, it, vi } from 'vitest';
import { PageOperations } from './PageOperations';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { DocumentState } from '../../engine/DocumentState';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { MoveService } from '../../vault/persistence/MoveService';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { PagePathResolver } from './PagePathResolver';
import { PageCreator } from './PageCreator';
import { PageFactory } from './PageFactory';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { FolderOperations } from '../folder/FolderOperations';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from '../folder/FolderCreator';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import type { Page } from '../../vault/models/Page';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

const ROOT = '/vault';

function buildPage(id: string, name: string): Page {
  const builder = new PageBuilder();
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/${name}.md`,
      directoryPath: ROOT,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: `${name} original body`,
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

/**
 * Same purpose as PageOperations.requestSave.test.ts's own gate — holds
 * a specific path's writeFile() open until released, so a test can
 * deterministically observe a genuinely in-flight save rather than
 * guessing at microtask timing. Keyed by path so multiple documents can
 * be gated independently within one test.
 */
class GatedVaultFileSystem implements VaultFileSystem {
  private readonly gates = new Map<string, Promise<void>>();
  private readonly onEnter = new Map<string, () => void>();
  public writeFileCallCounts = new Map<string, number>();

  constructor(private readonly inner: VaultFileSystem) {}

  hold(path: string): { release: () => void; entered: Promise<void> } {
    let release!: () => void;
    this.gates.set(
      path,
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const entered = new Promise<void>((resolve) => {
      this.onEnter.set(path, resolve);
    });
    return { release, entered };
  }

  async writeFile(path: string, contents: string): Promise<void> {
    this.writeFileCallCounts.set(path, (this.writeFileCallCounts.get(path) ?? 0) + 1);
    this.onEnter.get(path)?.();
    this.onEnter.delete(path);
    const gate = this.gates.get(path);
    if (gate) {
      await gate;
    }
    return this.inner.writeFile(path, contents);
  }

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
}

function setup(pages: Page[], fileSystem?: VaultFileSystem) {
  const vault = new Vault(
    ROOT,
    pages,
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  const inner = new InMemoryVaultFileSystem();
  for (const page of pages) {
    inner.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );
  }
  const resolvedFileSystem = fileSystem ?? inner;

  const workspace = new Workspace();
  const documentRegistry = new DocumentRegistry();
  const saveCoordinator = new SaveCoordinator();
  const moveService = new MoveService(vault, resolvedFileSystem);
  const coordinator = new PagePersistenceCoordinator(
    resolvedFileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService
  );
  const folderOperations = new FolderOperations(
    vault,
    workspace,
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(new UuidGenerator()),
    () => {},
    new DocumentRegistry(),
    new SaveCoordinator()
  );
  const pageOperations = new PageOperations(
    vault,
    workspace,
    documentRegistry,
    saveCoordinator,
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    folderOperations,
    new DailyNoteService(),
    () => {}
  );

  return { vault, inner, documentRegistry, coordinator, pageOperations };
}

describe('PageOperations.flushAll', () => {
  it('is a no-op when nothing is open', async () => {
    const { pageOperations } = setup([]);

    await expect(pageOperations.flushAll(1000)).resolves.toBeUndefined();
  });

  it('is a no-op when every open session is clean', async () => {
    const pageA = buildPage('page-a', 'A');
    const { inner, pageOperations } = setup([pageA]);
    await pageOperations.open('page-a');
    const writeSpy = vi.spyOn(inner, 'writeFile');

    await pageOperations.flushAll(1000);

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('flushes a dirty-but-idle session', async () => {
    const pageA = buildPage('page-a', 'A');
    const { inner, documentRegistry, pageOperations } = setup([pageA]);
    await pageOperations.open('page-a');
    pageOperations.commitEdit('page-a', 'Edited A');

    await pageOperations.flushAll(1000);

    expect(documentRegistry.get('page-a')!.isDirty).toBe(false);
    const persisted = await inner.readFile(`${ROOT}/A.md`);
    expect(persisted).toContain('Edited A');
  });

  it('excludes a session that is clean, while flushing one that is dirty, in the same call', async () => {
    const pageA = buildPage('page-a', 'A');
    const pageB = buildPage('page-b', 'B');
    const { inner, documentRegistry, pageOperations } = setup([pageA, pageB]);
    await pageOperations.open('page-a');
    await pageOperations.open('page-b');
    pageOperations.commitEdit('page-a', 'Edited A only');
    const writeSpy = vi.spyOn(inner, 'writeFile');

    await pageOperations.flushAll(1000);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith(`${ROOT}/A.md`, expect.any(String));
    expect(documentRegistry.get('page-a')!.isDirty).toBe(false);
    expect(documentRegistry.get('page-b')!.isDirty).toBe(false);
  });

  it('genuinely awaits an already-in-flight save rather than treating it as already flushed', async () => {
    const pageA = buildPage('page-a', 'A');
    const gated = new GatedVaultFileSystem(new InMemoryVaultFileSystem());
    const { documentRegistry, pageOperations } = setup([pageA], gated);
    await pageOperations.open('page-a');
    pageOperations.commitEdit('page-a', 'Edited A');

    // Simulate an earlier, never-awaited trigger (e.g. a debounce timer)
    // already having started a save for this session before shutdown.
    const { release, entered } = gated.hold(`${ROOT}/A.md`);
    void pageOperations.requestSave('page-a');
    await entered;
    expect(documentRegistry.get('page-a')!.state).toBe(DocumentState.Saving);

    const flushPromise = pageOperations.flushAll(5000);
    // flushAll() must not have resolved yet — the write it needs to wait
    // for is still gated closed.
    let flushResolved = false;
    void flushPromise.then(() => {
      flushResolved = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(flushResolved).toBe(false);

    release();
    await flushPromise;

    expect(flushResolved).toBe(true);
    expect(documentRegistry.get('page-a')!.isDirty).toBe(false);
  });

  it('flushes multiple dirty documents independently — one hung write never blocks another', async () => {
    const pageA = buildPage('page-a', 'A');
    const pageB = buildPage('page-b', 'B');
    const gated = new GatedVaultFileSystem(new InMemoryVaultFileSystem());
    const { documentRegistry, pageOperations } = setup([pageA, pageB], gated);
    await pageOperations.open('page-a');
    await pageOperations.open('page-b');
    pageOperations.commitEdit('page-a', 'Edited A');
    pageOperations.commitEdit('page-b', 'Edited B');

    // Hold A's write open indefinitely (within this test); never hold B's.
    const { entered: enteredA } = gated.hold(`${ROOT}/A.md`);

    const flushPromise = pageOperations.flushAll(50);
    await enteredA;

    // B has no gate held — it should complete on its own, independent of
    // A still being stuck, once flushAll's timeout elapses.
    await flushPromise;

    expect(documentRegistry.get('page-b')!.isDirty).toBe(false);
    // A is still mid-flight — flushAll gave up waiting for it once the
    // bounded timeout elapsed, per its own documented guarantee, but did
    // not corrupt or lose the content (still tracked as dirty/in-progress).
    expect(documentRegistry.get('page-a')!.state).toBe(DocumentState.Saving);
  });

  it('resolves once the timeout elapses even if a save is still pending', async () => {
    const pageA = buildPage('page-a', 'A');
    const gated = new GatedVaultFileSystem(new InMemoryVaultFileSystem());
    const { pageOperations } = setup([pageA], gated);
    await pageOperations.open('page-a');
    pageOperations.commitEdit('page-a', 'Edited A');
    gated.hold(`${ROOT}/A.md`); // held for the remainder of this test — never released

    const start = Date.now();
    await pageOperations.flushAll(50);
    const elapsed = Date.now() - start;

    // Resolved promptly around the timeout, not hung waiting forever.
    expect(elapsed).toBeLessThan(2000);
  });

  it('includes a still-unpersisted, dirty draft — no special-casing needed', async () => {
    const { inner, vault, documentRegistry, pageOperations } = setup([]);
    const draftId = await pageOperations.openDraft({ folderId: null, title: 'New Draft' });
    pageOperations.commitEdit(draftId, '# Draft content');

    await pageOperations.flushAll(1000);

    expect(vault.getPage(draftId)).toBeDefined();
    expect(documentRegistry.get(draftId)!.isDirty).toBe(false);
    const onDisk = await inner.readFile(vault.getPage(draftId)!.path);
    expect(onDisk).toContain('Draft content');
  });
});
