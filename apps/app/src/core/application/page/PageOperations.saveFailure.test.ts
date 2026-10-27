import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageOperations } from './PageOperations';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator, SAVE_RETRY_DELAYS_MS } from '../../engine/SaveCoordinator';
import { RECOVERY_DEBOUNCE_MS, RecoveryJournal } from '../../recovery/RecoveryJournal';
import { MemoryRecoveryStorage } from '../../recovery/RecoveryStorage';
import { parseRecord, recordFileName } from '../../recovery/RecoveryRecord';
import { fingerprint } from '../../recovery/fingerprint';
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
  async moveFile(sourcePath: string, destinationPath: string) {
    if (this.failing) {
      throw new Error('disk full');
    }
    return this.inner.moveFile(sourcePath, destinationPath);
  }
  copyFile(sourceAbsolutePath: string, destinationAbsolutePath: string) {
    return this.inner.copyFile(sourceAbsolutePath, destinationAbsolutePath);
  }
}

function buildSecondPage(): Page {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path: `${ROOT}/Other.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'page-2' },
      frontmatterAnalysis: { aliases: [] },
      content: 'Other body',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

async function openWithFailingDisk() {
  const page = buildPage();
  const inner = new InMemoryVaultFileSystem();
  inner.seedFile(page.path, new FrontmatterSerializer().serializeDocument(page, page.source.markdown));
  const fileSystem = new FlakyFileSystem(inner);
  const parts = setup(page, fileSystem);
  const second = buildSecondPage();
  parts.vault.addPage(second);
  inner.seedFile(second.path, new FrontmatterSerializer().serializeDocument(second, second.source.markdown));
  await parts.pageOperations.open(page.id);
  return { ...parts, page, second, fileSystem, session: parts.documentRegistry.get(page.id)! };
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

  describe('status, manual retry, and what survives navigation', () => {
    it('reports no failure until a save fails, then a scheduled retry, and tells subscribers', async () => {
      const { page, fileSystem, pageOperations } = await openWithFailingDisk();
      const listener = vi.fn();
      pageOperations.subscribeSaveFailures(listener);
      expect(pageOperations.saveFailureStatus(page.id)).toBeNull();

      fileSystem.failing = true;
      pageOperations.commitEdit(page.id, 'Edited body');
      await pageOperations.requestSave(page.id);

      expect(pageOperations.saveFailureStatus(page.id)).toBe('retry-scheduled');
      expect(pageOperations.failedSavePageIds()).toEqual([page.id]);
      expect(listener).toHaveBeenCalled();
    });

    it('says a retry is running while it runs, and needs-action once the automatic retries are used up', async () => {
      const { page, fileSystem, pageOperations } = await openWithFailingDisk();
      fileSystem.failing = true;
      pageOperations.commitEdit(page.id, 'Edited body');
      await pageOperations.requestSave(page.id);

      const release = fileSystem.hold();
      await vi.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[0]!);
      expect(pageOperations.saveFailureStatus(page.id)).toBe('retrying');
      release();
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

      expect(pageOperations.saveFailureStatus(page.id)).toBe('needs-action');
    });

    it('a manual retry goes through the normal save, and the failure clears only once the save is confirmed', async () => {
      const { page, fileSystem, pageOperations, session } = await openWithFailingDisk();
      fileSystem.failing = true;
      pageOperations.commitEdit(page.id, 'Edited body');
      await pageOperations.requestSave(page.id);
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(pageOperations.saveFailureStatus(page.id)).toBe('needs-action');

      // Still failing: the retry fails, the failure stays, nothing is claimed saved.
      await pageOperations.retrySave(page.id);
      expect(pageOperations.saveFailureStatus(page.id)).toBe('needs-action');
      expect(session.isDirty).toBe(true);

      fileSystem.failing = false;
      await pageOperations.retrySave(page.id);

      expect(pageOperations.saveFailureStatus(page.id)).toBeNull();
      expect(pageOperations.failedSavePageIds()).toEqual([]);
      expect(session.isDirty).toBe(false);
      expect(fileSystem.written).toHaveLength(1);
      expect(fileSystem.written[0]).toContain('Edited body');
    });

    it('pressing Retry while a save is in flight joins it: never two writes at once', async () => {
      const { page, fileSystem, pageOperations } = await openWithFailingDisk();
      fileSystem.failing = true;
      pageOperations.commitEdit(page.id, 'Edited body');
      await pageOperations.requestSave(page.id);

      fileSystem.failing = false;
      const release = fileSystem.hold();
      const first = pageOperations.retrySave(page.id);
      const second = pageOperations.retrySave(page.id);
      release();
      await Promise.all([first, second]);

      expect(fileSystem.maxInFlight).toBe(1);
      expect(fileSystem.written).toHaveLength(1);
      expect(pageOperations.saveFailureStatus(page.id)).toBeNull();
    });

    it('editing does not refill the retry budget: a persistent failure ends in needs-action, not an endless loop', async () => {
      const { page, fileSystem, pageOperations } = await openWithFailingDisk();
      fileSystem.failing = true;

      // Every edit gets its own autosave attempt (the 2s debounce); the retries on top of them come out of one budget.
      for (let edit = 0; edit < 8; edit += 1) {
        pageOperations.commitEdit(page.id, `edit ${edit}`);
        await vi.advanceTimersByTimeAsync(2000);
      }
      expect(pageOperations.saveFailureStatus(page.id)).toBe('needs-action');

      const attempts = fileSystem.attempts.length;
      pageOperations.commitEdit(page.id, 'one more edit');
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

      // Only that edit's own autosave attempt: no fresh retries were earned.
      expect(fileSystem.attempts.length - attempts).toBeLessThanOrEqual(2);
      expect(pageOperations.saveFailureStatus(page.id)).toBe('needs-action');
    });

    it('a note whose save failed keeps its unsaved revision, and stays listed, after the user opens another note', async () => {
      const { page, second, fileSystem, pageOperations, documentRegistry } = await openWithFailingDisk();
      fileSystem.failing = true;
      pageOperations.commitEdit(page.id, 'Edited body');
      await pageOperations.requestSave(page.id);

      await pageOperations.open(second.id);

      const kept = documentRegistry.get(page.id)!;
      expect(kept.isDirty).toBe(true);
      expect(kept.currentRevision.markdown).toBe('Edited body');
      expect(kept.state).not.toBe(DocumentState.Disposed);
      expect(pageOperations.failedSavePageIds()).toEqual([page.id]);
      expect(pageOperations.unsavedPageCount()).toBe(1);

      // Coming back to it reuses that session, edit intact.
      await pageOperations.open(page.id);
      expect(documentRegistry.get(page.id)).toBe(kept);
      expect(documentRegistry.get(page.id)!.currentRevision.markdown).toBe('Edited body');
    });

    it('a failed title save is no longer silent: it is a failure, retried, counted as unsaved, and clears when saved', async () => {
      const { page, fileSystem, pageOperations } = await openWithFailingDisk();
      fileSystem.failing = true;

      pageOperations.commitTitle(page.id, 'A new title');
      await pageOperations.requestTitleSave(page.id);

      expect(pageOperations.saveFailureStatus(page.id)).toBe('retry-scheduled');
      expect(pageOperations.unsavedPageCount()).toBe(1);

      fileSystem.failing = false;
      await vi.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[0]!);

      expect(pageOperations.saveFailureStatus(page.id)).toBeNull();
      expect(pageOperations.unsavedPageCount()).toBe(0);
    });

    it('a failed description save is surfaced and retried the same way', async () => {
      const { page, fileSystem, pageOperations } = await openWithFailingDisk();
      fileSystem.failing = true;

      pageOperations.commitDescription(page.id, 'A description');
      await pageOperations.requestDescriptionSave(page.id);

      expect(pageOperations.saveFailureStatus(page.id)).toBe('retry-scheduled');
      expect(pageOperations.unsavedPageCount()).toBe(1);

      fileSystem.failing = false;
      await pageOperations.retrySave(page.id);

      expect(pageOperations.saveFailureStatus(page.id)).toBeNull();
    });

    it('closing a failed page removes it from the failures and cancels its retry', async () => {
      const { page, fileSystem, pageOperations } = await openWithFailingDisk();
      fileSystem.failing = true;
      pageOperations.commitEdit(page.id, 'Edited body');
      await pageOperations.requestSave(page.id);
      const listener = vi.fn();
      pageOperations.subscribeSaveFailures(listener);

      pageOperations.close(page.id);

      expect(pageOperations.failedSavePageIds()).toEqual([]);
      expect(listener).toHaveBeenCalled();
    });
  });
});

describe('recovery: what is recoverable, and the journal over the real PageOperations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function withJournal() {
    const parts = await openWithFailingDisk();
    const storage = new MemoryRecoveryStorage();
    const journal = new RecoveryJournal({ storage, vaultKey: 'space-1', source: parts.pageOperations, session: 'aaaaaaaa' });
    journal.start();
    const record = (pageId: string) => {
      const text = storage.files.get(`space-1/${recordFileName(pageId, 'aaaaaaaa')}`);
      return text === undefined ? null : parseRecord(text);
    };
    return { ...parts, storage, journal, record };
  }

  it('reports nothing for a clean page, and each unsaved field for a dirty one, from where it actually lives', async () => {
    const { page, pageOperations, fileSystem } = await openWithFailingDisk();
    fileSystem.failing = true;
    expect(pageOperations.recoverableState(page.id)).toBeNull();

    pageOperations.commitEdit(page.id, 'Edited body');
    pageOperations.commitTitle(page.id, 'Edited title');
    pageOperations.commitDescription(page.id, 'Edited description');

    const state = pageOperations.recoverableState(page.id)!;
    expect(state.kind).toBe('page');
    expect(state.body?.markdown).toBe('Edited body');
    expect(state.title).toBe('Edited title');
    expect(state.description).toBe('Edited description');
    expect(state.vault).toMatchObject({ body: 'Original body', title: page.name });
    expect(pageOperations.unsavedPageIds()).toEqual([page.id]);
  });

  it('reports only the fields that are unsaved', async () => {
    const { page, pageOperations } = await openWithFailingDisk();

    pageOperations.commitTitle(page.id, 'Only the title');

    const state = pageOperations.recoverableState(page.id)!;
    expect(state.body).toBeNull();
    expect(state.description).toBeNull();
    expect(state.title).toBe('Only the title');
  });

  it('a draft that has no vault file yet is recoverable, with what it needs to become a note', async () => {
    const { pageOperations } = await openWithFailingDisk();
    const draftId = await pageOperations.openDraft({ folderId: null, title: undefined });

    pageOperations.commitEdit(draftId, '# A brand new idea\n\nwith a body');

    const state = pageOperations.recoverableState(draftId)!;
    expect(state.kind).toBe('draft');
    expect(state.pagePath).toBeNull();
    expect(state.vault).toBeNull();
    expect(state.body?.markdown).toContain('A brand new idea');
    expect(state.draft).toMatchObject({ folderId: null, type: 'note' });
    expect(state.label).toBe('A brand new idea');
  });

  it('keeps several dirty notes apart', async () => {
    const { page, second, pageOperations } = await openWithFailingDisk();
    await pageOperations.open(second.id);

    pageOperations.commitEdit(page.id, 'first edit');
    pageOperations.commitEdit(second.id, 'second edit');

    expect([...pageOperations.unsavedPageIds()].sort()).toEqual([page.id, second.id].sort());
    expect(pageOperations.recoverableState(page.id)!.body!.markdown).toBe('first edit');
    expect(pageOperations.recoverableState(second.id)!.body!.markdown).toBe('second edit');
  });

  it('after a failed save and more edits, the recoverable state is the newest content', async () => {
    const { page, pageOperations, fileSystem } = await openWithFailingDisk();
    fileSystem.failing = true;
    pageOperations.commitEdit(page.id, 'before the failure');
    await pageOperations.requestSave(page.id);

    pageOperations.commitEdit(page.id, 'after the failure');

    expect(pageOperations.recoverableState(page.id)!.body!.markdown).toBe('after the failure');
  });

  it('notifies subscribers of edits, save results and closing', async () => {
    const { page, pageOperations, fileSystem } = await openWithFailingDisk();
    const seen: (string | undefined)[] = [];
    pageOperations.subscribeUnsaved((id) => seen.push(id));
    fileSystem.failing = true;

    pageOperations.commitEdit(page.id, 'edit');
    await pageOperations.requestSave(page.id);
    pageOperations.close(page.id);

    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(new Set(seen)).toEqual(new Set([page.id]));
  });

  it('a failed vault save does not stop the snapshot, and the record keeps the newest edit', async () => {
    const { page, pageOperations, fileSystem, record } = await withJournal();
    fileSystem.failing = true;

    pageOperations.commitEdit(page.id, 'edit one');
    await pageOperations.requestSave(page.id); // the vault save fails
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 10);
    expect(pageOperations.saveFailureStatus(page.id)).not.toBeNull();
    expect(record(page.id)!.body!.markdown).toBe('edit one');
    pageOperations.commitEdit(page.id, 'edit two');
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 10);

    expect(record(page.id)!.body!.markdown).toBe('edit two');
    expect(record(page.id)!.base.body).toBe(fingerprint('Original body'));
    expect(pageOperations.recoverableState(page.id)).not.toBeNull(); // the failed save did not mark it saved
  });

  it('a confirmed save removes the record, and only that note’s', async () => {
    const { page, second, pageOperations, fileSystem, record } = await withJournal();
    await pageOperations.open(second.id);
    fileSystem.failing = true;
    pageOperations.commitEdit(page.id, 'first edit');
    pageOperations.commitEdit(second.id, 'second edit');
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 10);
    expect(record(page.id)).not.toBeNull();
    expect(record(second.id)).not.toBeNull();

    fileSystem.failing = false;
    await pageOperations.retrySave(page.id);
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 10);

    expect(record(page.id)).toBeNull();
    expect(record(second.id)!.body!.markdown).toBe('second edit');
  });

  it('saving an older revision while a newer one is waiting leaves the newer one protected', async () => {
    const { page, pageOperations, fileSystem, record, session } = await withJournal();
    const releaseFirst = fileSystem.hold();

    pageOperations.commitEdit(page.id, 'revision one');
    const saving = pageOperations.requestSave(page.id); // the write for revision one starts, held
    await vi.advanceTimersByTimeAsync(10);
    pageOperations.commitEdit(page.id, 'revision two'); // typed while revision one is being saved
    const releaseSecond = fileSystem.hold(); // the follow-up save of revision two will be held too
    releaseFirst();
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 10);

    // Revision one is saved; revision two is not, and its record must exist now.
    expect(fileSystem.written).toHaveLength(1);
    expect(session.isDirty).toBe(true);
    expect(record(page.id)!.body).toMatchObject({ markdown: 'revision two' });

    releaseSecond();
    await saving;
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 10);

    expect(session.isDirty).toBe(false);
    expect(record(page.id)).toBeNull();
  });
});
