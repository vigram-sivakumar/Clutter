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

/**
 * Wraps a real VaultFileSystem so a test can hold a single writeFile()
 * call open until it deliberately releases it — the only way to
 * deterministically observe an "in-flight" Gate write (SaveCoordinator's
 * Saving state) in a test, rather than guessing how many microtask ticks
 * an unheld write takes to resolve.
 */
class GatedVaultFileSystem implements VaultFileSystem {
  private gate: Promise<void> = Promise.resolve();
  private onEnter: (() => void) | null = null;
  public writeFileCallCount = 0;

  constructor(private readonly inner: VaultFileSystem) {}

  /**
   * Blocks the next writeFile() call until release() is invoked. The
   * returned `entered` promise resolves the instant writeFile() is called
   * (before it awaits the gate), so a test can await it to know the write
   * has genuinely started, deterministically.
   */
  hold(): { release: () => void; entered: Promise<void> } {
    let release!: () => void;
    this.gate = new Promise((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      this.onEnter = resolve;
    });
    return { release, entered };
  }

  async writeFile(path: string, contents: string): Promise<void> {
    this.writeFileCallCount += 1;
    this.onEnter?.();
    this.onEnter = null;
    await this.gate;
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

function setup(page: Page, fileSystem?: VaultFileSystem) {
  const vault = new Vault(
    ROOT,
    [page],
    [makeArchiveFolder()],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  const inner = new InMemoryVaultFileSystem();
  inner.seedFile(
    page.path,
    new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
  );
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
    new SaveCoordinator(),
    () => {}
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

  return {
    vault,
    fileSystem: resolvedFileSystem,
    inner,
    documentRegistry,
    saveCoordinator,
    coordinator,
    pageOperations,
  };
}

async function archiveDirectly(
  coordinator: PagePersistenceCoordinator,
  pageId: string
) {
  await coordinator.enqueue(pageId, { kind: 'archive' });
}

describe('PageOperations.requestSave: coalescing table, end-to-end', () => {
  it('Clean + not dirty -> no Gate write at all', async () => {
    const page = buildPage();
    const { inner, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    const writeSpy = vi.spyOn(inner, 'writeFile');

    await pageOperations.requestSave(page.id);

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('Clean + dirty -> exactly one Gate write, with the committed content', async () => {
    const page = buildPage();
    const { inner, documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    pageOperations.commitEdit(page.id, 'Edited body');
    const writeSpy = vi.spyOn(inner, 'writeFile');

    await pageOperations.requestSave(page.id);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(documentRegistry.get(page.id)!.state).toBe(DocumentState.Clean);
    expect(documentRegistry.get(page.id)!.isDirty).toBe(false);
    const persisted = await inner.readFile(page.path);
    expect(persisted).toContain('Edited body');
  });

  it('is a silent no-op when no session is open for the page id', async () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    await expect(pageOperations.requestSave(page.id)).resolves.toBeUndefined();
  });

  it('is a silent no-op for an id that was never opened at all', async () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    await expect(
      pageOperations.requestSave('unknown-id')
    ).resolves.toBeUndefined();
  });
});

describe('PageOperations.requestSave: in-flight save (Saving row + T10 restart)', () => {
  it('Saving + not dirty -> a second request is suppressed, not a second write', async () => {
    const page = buildPage();
    const gated = new GatedVaultFileSystem(new InMemoryVaultFileSystem());
    const { pageOperations, documentRegistry } = setup(page, gated);
    await pageOperations.open(page.id);
    documentRegistry.get(page.id)!; // seed access, no-op
    pageOperations.commitEdit(page.id, 'First edit');

    const { release, entered } = gated.hold();
    const firstCall = pageOperations.requestSave(page.id);
    await entered; // the first write has genuinely started and is blocked

    expect(gated.writeFileCallCount).toBe(1);

    // A second trigger fires while the first save is still in flight, with
    // nothing new committed since it started.
    const secondCall = pageOperations.requestSave(page.id);

    release();
    await Promise.all([firstCall, secondCall]);

    // Exactly one write occurred — the second call was suppressed, not a
    // second concurrent enqueue.
    expect(gated.writeFileCallCount).toBe(1);
  });

  it('Saving + dirty (typing during the save) -> exactly one automatic restart, not a duplicate concurrent write', async () => {
    const page = buildPage();
    const gated = new GatedVaultFileSystem(new InMemoryVaultFileSystem());
    const { pageOperations, documentRegistry, inner } = setup(page, gated);
    void inner; // unused directly; assertions read through gated's inner via readFile below
    await pageOperations.open(page.id);
    pageOperations.commitEdit(page.id, 'First edit');

    const { release, entered } = gated.hold();
    const requestPromise = pageOperations.requestSave(page.id);
    await entered; // first write in flight, blocked

    expect(documentRegistry.get(page.id)!.state).toBe(DocumentState.Saving);
    expect(gated.writeFileCallCount).toBe(1);

    // More typing arrives while the first save is still in flight.
    pageOperations.commitEdit(page.id, 'Second edit, during save');

    // A trigger fires now (e.g. the debounce ceiling, or navigation) — per
    // the Saving+dirty row, this must not start a second concurrent write
    // while the first is still gated. As of M8, it also isn't a trivial
    // suppressed no-op: since a save for this id is already in flight,
    // this second call receives that exact same (still-pending) promise
    // — asserted directly — so it correctly won't resolve until the whole
    // restart cycle below finishes, not just because it happened not to
    // race a new write. It must NOT be awaited yet, or this test would
    // deadlock waiting on itself before release() ever runs.
    const secondCall = pageOperations.requestSave(page.id);
    expect(secondCall).toBe(requestPromise);
    expect(gated.writeFileCallCount).toBe(1);

    // Release the first write — it should complete, then the loop inside
    // the *original* requestSave() call should detect the session is
    // still dirty and automatically restart exactly once. Both variables
    // reference the same promise at this point, but awaiting both is
    // still correct and makes the intent explicit.
    release();
    await Promise.all([requestPromise, secondCall]);

    expect(gated.writeFileCallCount).toBe(2);
    expect(documentRegistry.get(page.id)!.state).toBe(DocumentState.Clean);
    expect(documentRegistry.get(page.id)!.isDirty).toBe(false);
  });

  it('the five-trigger scenario from autosave-execution-model.md §4.2 produces exactly one Gate write', async () => {
    const page = buildPage();
    const { inner, pageOperations, documentRegistry } = setup(page);
    await pageOperations.open(page.id);
    const writeSpy = vi.spyOn(inner, 'writeFile');

    // Continuous typing (commits only, no Gate involvement).
    pageOperations.commitEdit(page.id, 'A');
    pageOperations.commitEdit(page.id, 'AB');
    pageOperations.commitEdit(page.id, 'ABC');

    // "Blur" fires first and actually saves.
    await pageOperations.requestSave(page.id);
    expect(writeSpy).toHaveBeenCalledTimes(1);

    // "Debounce" and "navigation" fire afterward, with nothing new typed —
    // both must be suppressed.
    await pageOperations.requestSave(page.id);
    await pageOperations.requestSave(page.id);
    expect(writeSpy).toHaveBeenCalledTimes(1);

    // "Shutdown" (simulated here as one more request) finds nothing left
    // to do either.
    await pageOperations.requestSave(page.id);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(documentRegistry.get(page.id)!.isDirty).toBe(false);
  });
});

describe('PageOperations.requestSave: concurrent calls share one in-flight promise (M8 prerequisite)', () => {
  it('two concurrent requestSave() calls for the same page return the exact same promise object', async () => {
    const page = buildPage();
    const gated = new GatedVaultFileSystem(new InMemoryVaultFileSystem());
    const { pageOperations } = setup(page, gated);
    await pageOperations.open(page.id);
    pageOperations.commitEdit(page.id, 'Edited body');

    const { release, entered } = gated.hold();
    const firstCall = pageOperations.requestSave(page.id);
    await entered;

    const secondCall = pageOperations.requestSave(page.id);

    // Not merely "both eventually resolve" — the second call must be the
    // identical Promise instance, not a new one that happens to resolve
    // around the same time. This is what lets a caller like flushAll()
    // genuinely await the real, already-running attempt rather than a
    // redundant one that resolves the moment evaluate() sees Saving.
    expect(secondCall).toBe(firstCall);

    release();
    await Promise.all([firstCall, secondCall]);
  });

  it('results in exactly one persistence operation, not one per caller', async () => {
    const page = buildPage();
    const gated = new GatedVaultFileSystem(new InMemoryVaultFileSystem());
    const { pageOperations, documentRegistry } = setup(page, gated);
    await pageOperations.open(page.id);
    pageOperations.commitEdit(page.id, 'Edited body');

    const { release, entered } = gated.hold();
    const calls = [
      pageOperations.requestSave(page.id),
      pageOperations.requestSave(page.id),
      pageOperations.requestSave(page.id),
    ];
    await entered;

    expect(gated.writeFileCallCount).toBe(1);

    release();
    await Promise.all(calls);

    expect(gated.writeFileCallCount).toBe(1);
    expect(documentRegistry.get(page.id)!.isDirty).toBe(false);
  });
});

describe('PageOperations.requestSave: failure handling (never an unhandled rejection)', () => {
  it('T11a — archived page: resolves without throwing, session reaches SaveError', async () => {
    const page = buildPage();
    const { coordinator, documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    pageOperations.commitEdit(page.id, 'Edited body');
    await archiveDirectly(coordinator, page.id);

    await expect(pageOperations.requestSave(page.id)).resolves.toBeUndefined();

    expect(documentRegistry.get(page.id)!.state).toBe(DocumentState.SaveError);
  });

  it('T11a — archived page: notifies subscribers exactly once for the failure', async () => {
    const page = buildPage();
    const { coordinator, documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    pageOperations.commitEdit(page.id, 'Edited body');
    await archiveDirectly(coordinator, page.id);
    const session = documentRegistry.get(page.id)!;
    let notifications = 0;
    session.subscribe(() => {
      notifications += 1;
    });

    await pageOperations.requestSave(page.id);

    expect(notifications).toBe(1);
  });

  it('T11b — Gate write failure: resolves without throwing, session reaches SaveError, no redundant third notification', async () => {
    const page = buildPage();
    const inner = new InMemoryVaultFileSystem();
    const failingFileSystem: VaultFileSystem = {
      ...inner,
      exists: inner.exists.bind(inner),
      createDirectory: inner.createDirectory.bind(inner),
      readDirectory: inner.readDirectory.bind(inner),
      readFile: inner.readFile.bind(inner),
      deleteFile: inner.deleteFile.bind(inner),
      moveFile: inner.moveFile.bind(inner),
      writeFile: vi.fn().mockRejectedValue(new Error('disk full')),
    };
    inner.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );
    const { documentRegistry, pageOperations } = setup(page, failingFileSystem);
    await pageOperations.open(page.id);
    pageOperations.commitEdit(page.id, 'Edited body');
    const session = documentRegistry.get(page.id)!;
    let notifications = 0;
    session.subscribe(() => {
      notifications += 1;
    });

    await expect(pageOperations.requestSave(page.id)).resolves.toBeUndefined();

    // Two notifications are legitimately expected here — beginSave()'s own
    // Clean->Saving transition, then failSave()'s Saving->SaveError
    // transition (both already-shipped DocumentSession behavior, unrelated
    // to this milestone). What this test actually verifies is the fix from
    // this milestone: rejectSaveRequest() must NOT also fire a third,
    // redundant notify() for a state that already reached SaveError via
    // save()'s own internal failSave() call before re-throwing.
    expect(session.state).toBe(DocumentState.SaveError);
    expect(notifications).toBe(2);
  });

  it('a subsequent request after SaveError retries and succeeds once the underlying cause is gone', async () => {
    const page = buildPage();
    const { coordinator, documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    pageOperations.commitEdit(page.id, 'Edited body');
    await archiveDirectly(coordinator, page.id);
    await pageOperations.requestSave(page.id);
    expect(documentRegistry.get(page.id)!.state).toBe(DocumentState.SaveError);

    await coordinator.enqueue(page.id, { kind: 'restore' });
    await pageOperations.requestSave(page.id);

    expect(documentRegistry.get(page.id)!.state).toBe(DocumentState.Clean);
    expect(documentRegistry.get(page.id)!.isDirty).toBe(false);
  });
});

describe('PageOperations.requestSave: stale completion — racing a direct save() call (T7) is unaffected by M4', () => {
  it('a requestSave()-triggered save that loses the race to a later direct save() produces no notification and does not corrupt final state', async () => {
    const page = buildPage();
    const { inner, documentRegistry, pageOperations } = setup(page);
    await pageOperations.open(page.id);
    const session = documentRegistry.get(page.id)!;
    pageOperations.commitEdit(page.id, 'Autosave content');

    // Call A: an autosave trigger. Runs synchronously up to its own
    // internal `await coordinator.enqueue(...)`, at which point beginSave()
    // has already set activeSaves to revision A and state to Saving.
    const callA = pageOperations.requestSave(page.id);

    // Call B: a direct manual save (T7), bypassing requestSave() entirely,
    // exactly as it already could before M4. It also runs synchronously up
    // to its own `await coordinator.enqueue(...)` — its own beginSave()
    // overwrites SaveCoordinator's single activeSaves entry for this
    // session with revision B, before A's Gate write has resolved.
    const callB = pageOperations.save(page.id, 'Manual save content');

    // Subscribe only now, after both synchronous prefixes above have
    // already run — isolating exactly the invariant under test: how many
    // notifications fire from this point on, as each call's Gate write
    // actually resolves (the Gate's own per-page queue processes A then
    // B, in enqueue order, per spec §5).
    let notifications = 0;
    session.subscribe(() => {
      notifications += 1;
    });

    await Promise.all([callA, callB]);

    // A's completion is stale by the time it resolves (activeSaves no
    // longer holds revision A) — SaveCoordinator's existing, unmodified
    // guard silently drops it: no markSaved(), no notify(). Only B's
    // genuine completion fires.
    expect(notifications).toBe(1);

    // Final state reflects the winning (later) write, not the stale one —
    // A's write did physically happen on disk, but B's write, processed
    // second by the Gate's serialized queue, is what Vault and the
    // session both end up agreeing on.
    expect(session.state).toBe(DocumentState.Clean);
    expect(session.isDirty).toBe(false);
    expect(session.savedRevision.markdown).toBe('Manual save content');
    const onDisk = await inner.readFile(page.path);
    expect(onDisk).toContain('Manual save content');
  });
});

describe('PageOperations.requestSave: draft promotion is unchanged', () => {
  it('promotes an unpersisted draft through the existing save()/persistDraft() path — no second mechanism', async () => {
    const page = buildPage();
    const { vault, inner, pageOperations, documentRegistry } = setup(page);
    const draftId = await pageOperations.openDraft({
      folderId: null,
      title: 'New Draft',
    });
    pageOperations.commitEdit(draftId, '# A brand new draft');

    expect(vault.getPage(draftId)).toBeUndefined();

    await pageOperations.requestSave(draftId);

    const promoted = vault.getPage(draftId);
    expect(promoted).toBeDefined();
    expect(promoted!.source.markdown).toBe('# A brand new draft');
    expect(documentRegistry.get(draftId)!.isDirty).toBe(false);
    const onDisk = await inner.readFile(promoted!.path);
    expect(onDisk).toContain('A brand new draft');
  });
});
