import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageOperations } from './PageOperations';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator, SAVE_RETRY_DELAYS_MS } from '../../engine/SaveCoordinator';
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
  defaultTemplateId: null,
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
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

/**
 * A filesystem whose writes can be made to fail, hold open, and be observed: every attempt is recorded with the
 * (fake) time it started, successful writes keep their document text, and the number of writes in flight at once
 * is tracked so a test can prove retries never overlap.
 */
class FlakyFileSystem implements VaultFileSystem {
  public failing = false;
  public attempts: { at: number }[] = [];
  public written: string[] = [];
  public inFlight = 0;
  public maxInFlight = 0;
  private gate: Promise<void> = Promise.resolve();

  constructor(private readonly inner: VaultFileSystem) {}

  hold(): () => void {
    let release!: () => void;
    this.gate = new Promise((resolve) => {
      release = resolve;
    });
    return release;
  }

  async writeFile(path: string, contents: string): Promise<void> {
    this.attempts.push({ at: Date.now() });
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      await this.gate;
      if (this.failing) {
        throw new Error('disk full');
      }
      await this.inner.writeFile(path, contents);
      this.written.push(contents);
    } finally {
      this.inFlight -= 1;
    }
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
  copyFile(sourceAbsolutePath: string, destinationAbsolutePath: string) {
    return this.inner.copyFile(sourceAbsolutePath, destinationAbsolutePath);
  }
}

async function openWithFailingDisk() {
  const page = buildPage();
  const inner = new InMemoryVaultFileSystem();
  inner.seedFile(page.path, new FrontmatterSerializer().serializeDocument(page, page.source.markdown));
  const fileSystem = new FlakyFileSystem(inner);
  const parts = setup(page, fileSystem);
  await parts.pageOperations.open(page.id);
  return { ...parts, page, fileSystem, session: parts.documentRegistry.get(page.id)! };
}

describe('PageOperations: a failed save is kept, retried on a bounded backoff, and never silent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a failed save leaves the latest revision dirty, in memory, in SaveError', async () => {
    const { page, fileSystem, pageOperations, session } = await openWithFailingDisk();
    fileSystem.failing = true;

    pageOperations.commitEdit(page.id, 'Edited body');
    await pageOperations.requestSave(page.id);

    expect(session.state).toBe(DocumentState.SaveError);
    expect(session.isDirty).toBe(true);
    expect(session.currentRevision.markdown).toBe('Edited body');
    expect(pageOperations.unsavedPageCount()).toBe(1);
  });

  it('retries automatically, and a successful retry clears the failure and the unsaved count', async () => {
    const { page, fileSystem, pageOperations, session } = await openWithFailingDisk();
    fileSystem.failing = true;
    pageOperations.commitEdit(page.id, 'Edited body');
    await pageOperations.requestSave(page.id);
    expect(session.state).toBe(DocumentState.SaveError);

    fileSystem.failing = false;
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[0]!);

    expect(session.state).toBe(DocumentState.Clean);
    expect(session.isDirty).toBe(false);
    expect(pageOperations.unsavedPageCount()).toBe(0);
    expect(fileSystem.written).toHaveLength(1);
    expect(fileSystem.written[0]).toContain('Edited body');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is bounded: a save that never succeeds is tried once plus one retry per backoff step, then left alone', async () => {
    const { page, fileSystem, pageOperations, session } = await openWithFailingDisk();
    fileSystem.failing = true;
    pageOperations.commitEdit(page.id, 'Edited body');
    await pageOperations.requestSave(page.id);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    // The 2s autosave debounce re-requests the save first (an edit's own trigger), then one retry per step.
    expect(fileSystem.attempts.length).toBeLessThanOrEqual(2 + SAVE_RETRY_DELAYS_MS.length);
    expect(vi.getTimerCount()).toBe(0);
    // Still honest about it: unsaved, dirty, failed.
    expect(session.state).toBe(DocumentState.SaveError);
    expect(session.isDirty).toBe(true);
  });

  it('backs off exponentially: each retry waits its own step after the failure before it', async () => {
    const { page, fileSystem, pageOperations } = await openWithFailingDisk();
    fileSystem.failing = true;
    pageOperations.commitEdit(page.id, 'Edited body');
    await pageOperations.requestSave(page.id);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    const gaps = fileSystem.attempts.slice(1).map((attempt, index) => attempt.at - fileSystem.attempts[index]!.at);
    expect(gaps).toEqual([...SAVE_RETRY_DELAYS_MS]);
  });

  it('a successful save resets the schedule: the next failure starts again at the first step', async () => {
    const { page, fileSystem, pageOperations, session } = await openWithFailingDisk();
    fileSystem.failing = true;
    pageOperations.commitEdit(page.id, 'one');
    await pageOperations.requestSave(page.id);
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[0]!); // retry 1 fails
    fileSystem.failing = false;
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[1]!); // retry 2 succeeds
    expect(session.state).toBe(DocumentState.Clean);

    fileSystem.failing = true;
    pageOperations.commitEdit(page.id, 'two');
    await pageOperations.requestSave(page.id);
    const failedAt = Date.now();
    fileSystem.failing = false;
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[0]!);

    expect(session.state).toBe(DocumentState.Clean);
    expect(fileSystem.attempts[fileSystem.attempts.length - 1]!.at - failedAt).toBe(SAVE_RETRY_DELAYS_MS[0]);
  });

  it('a newer edit supersedes the failed revision: only the newest content is ever written', async () => {
    const { page, fileSystem, pageOperations, session } = await openWithFailingDisk();
    fileSystem.failing = true;
    pageOperations.commitEdit(page.id, 'older revision');
    await pageOperations.requestSave(page.id);
    expect(vi.getTimerCount()).toBeGreaterThan(0); // a retry for the older revision is pending

    fileSystem.failing = false;
    pageOperations.commitEdit(page.id, 'newer revision'); // cancels that retry, arms the normal autosave
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(fileSystem.written).toHaveLength(1);
    expect(fileSystem.written[0]).toContain('newer revision');
    expect(fileSystem.written.join('\n')).not.toContain('older revision');
    expect(session.isDirty).toBe(false);
  });

  it('a retry that fires while a newer edit is being saved joins that save: never two writes in flight', async () => {
    const { page, fileSystem, pageOperations } = await openWithFailingDisk();
    fileSystem.failing = true;
    pageOperations.commitEdit(page.id, 'older revision');
    await pageOperations.requestSave(page.id);

    fileSystem.failing = false;
    const release = fileSystem.hold();
    // The retry fires and starts a (held) write; then flushAll and another request arrive meanwhile.
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[0]!);
    const flush = pageOperations.flushAll(10_000);
    const again = pageOperations.requestSave(page.id);
    release();
    await Promise.all([flush, again]);

    expect(fileSystem.maxInFlight).toBe(1);
    expect(fileSystem.written).toHaveLength(1);
  });

  it('repeated failures never leave an orphaned retry timer: closing the page clears every timer', async () => {
    const { page, fileSystem, pageOperations } = await openWithFailingDisk();
    fileSystem.failing = true;
    pageOperations.commitEdit(page.id, 'Edited body');
    await pageOperations.requestSave(page.id);
    await pageOperations.flushAll(10_000);
    await pageOperations.flushAll(10_000);
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[0]!);

    // A retry timer the coordinator had lost track of (stacked, not replaced) would survive this and keep firing.
    // (flushAll's own 10s timeout timers are unrelated and simply run out.)
    const attempts = fileSystem.attempts.length;
    pageOperations.close(page.id);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(vi.getTimerCount()).toBe(0);
    expect(fileSystem.attempts).toHaveLength(attempts);
  });

  it('closing the page cancels its pending retry: nothing is written afterwards', async () => {
    const { page, fileSystem, pageOperations } = await openWithFailingDisk();
    fileSystem.failing = true;
    pageOperations.commitEdit(page.id, 'Edited body');
    await pageOperations.requestSave(page.id);
    const attemptsBefore = fileSystem.attempts.length;
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    fileSystem.failing = false;
    pageOperations.close(page.id);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(vi.getTimerCount()).toBe(0);
    expect(fileSystem.attempts).toHaveLength(attemptsBefore);
  });

  it('a failed flush still counts the page as unsaved, so a close cannot treat the flush as a save', async () => {
    const { page, fileSystem, pageOperations } = await openWithFailingDisk();
    fileSystem.failing = true;
    pageOperations.commitEdit(page.id, 'Edited body');

    await pageOperations.flushAll(10_000);

    expect(pageOperations.unsavedPageCount()).toBe(1);
  });

  it('a validation failure (archived page) is not retried: nothing improves with time', async () => {
    const { page, coordinator, saveCoordinator, pageOperations, session } = await openWithFailingDisk();
    const scheduleRetry = vi.spyOn(saveCoordinator, 'scheduleRetry');
    pageOperations.commitEdit(page.id, 'Edited body');
    await archiveDirectly(coordinator, page.id);

    await pageOperations.requestSave(page.id);

    expect(session.state).toBe(DocumentState.SaveError);
    expect(scheduleRetry).not.toHaveBeenCalled();
  });
});
