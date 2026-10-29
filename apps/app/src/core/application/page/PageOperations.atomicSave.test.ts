import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageOperations } from './PageOperations';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator, SAVE_RETRY_DELAYS_MS } from '../../engine/SaveCoordinator';
import { RECOVERY_DEBOUNCE_MS, RecoveryJournal } from '../../recovery/RecoveryJournal';
import { MemoryRecoveryStorage } from '../../recovery/RecoveryStorage';
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


import { AtomicWriteFileSystem } from '../../vault/atomicWrite/AtomicWriteFileSystem';
import { DurabilityTracker } from '../../vault/atomicWrite/DurabilityTracker';
import { InMemoryAtomicVaultWriter } from '../../vault/testing/InMemoryAtomicVaultWriter';
import type { InspectionResult } from '../../vault/atomicWrite/AtomicWriteContract';

/**
 * ADR-063, decision 13, end to end over the in-memory simulation: the user's edit goes through the real
 * PageOperations, Persistence Gate, atomic provider, durability tracker and crash-recovery journal. Each test names the
 * situation (a refusal, a save in doubt, a save installed with a flush gap) and what the user and the recovery record
 * must see.
 */
async function openOnAtomicProvider() {
  const page = buildPage();
  const disk = new InMemoryVaultFileSystem();
  disk.seedFile(page.path, new FrontmatterSerializer().serializeDocument(page, page.source.markdown));
  const writer = new InMemoryAtomicVaultWriter(disk);
  const changes: string[] = [];
  let recheck: (path: string) => void = () => undefined;
  const tracker = new DurabilityTracker(writer, { delaysMs: [1_000, 2_000], onChange: (path) => recheck(path) });
  const atomic = new AtomicWriteFileSystem(disk, writer, tracker);
  const parts = setup(page, atomic);

  const storage = new MemoryRecoveryStorage();
  const journal = new RecoveryJournal({
    storage,
    vaultKey: 'space-1',
    source: parts.pageOperations,
    session: 'aaaaaaaa',
    holdRecord: (pageId) => {
      const path = parts.vault.getPage(pageId)?.path;
      return path !== undefined && tracker.hasPending(path);
    },
  });
  recheck = (path) => {
    changes.push(path);
    const found = parts.vault.getPageByPath(path);
    if (found) journal.recheck(found.id);
  };
  journal.start();
  await parts.pageOperations.open(page.id);

  const recordExists = () => [...storage.files.keys()].some((name) => name.startsWith('space-1/') && name.includes(page.id));

  return { ...parts, page, disk, writer, tracker, journal, atomic, storage, recordExists, changes, session: parts.documentRegistry.get(page.id)! };
}

describe('an edit saved through the atomic provider', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function edit(parts: Awaited<ReturnType<typeof openOnAtomicProvider>>, text: string) {
    parts.pageOperations.commitEdit(parts.page.id, text);
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 50);
    await parts.pageOperations.requestSave(parts.page.id);
    await vi.advanceTimersByTimeAsync(10);
  }

  it('a normal save is written whole, clean, with no failure and no record left', async () => {
    const parts = await openOnAtomicProvider();

    await edit(parts, 'Edited body');
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 50);

    expect(await parts.disk.readFile(parts.page.path)).toContain('Edited body');
    expect(parts.session.state).toBe(DocumentState.Clean);
    expect(parts.pageOperations.saveFailureStatus(parts.page.id)).toBeNull();
    expect(parts.recordExists()).toBe(false);
    expect(parts.writer.calls.some((call) => call.startsWith('write:replace:'))).toBe(true);
  });

  it('a save installed with a flush gap is a success, never rewritten, and keeps its record until the flush is confirmed', async () => {
    const parts = await openOnAtomicProvider();
    parts.writer.injectDurabilityFailure(); // the first confirmation is still unconfirmed
    parts.writer.inject({ kind: 'durability-unconfirmed' });

    await edit(parts, 'Edited body');
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 50);

    expect(await parts.disk.readFile(parts.page.path)).toContain('Edited body');
    expect(parts.session.state).toBe(DocumentState.Clean); // not shown as failed
    expect(parts.pageOperations.saveFailureStatus(parts.page.id)).toBeNull();
    expect(parts.recordExists()).toBe(true); // held: a power loss could still take the saved file back
    expect(parts.writer.calls.filter((call) => call.startsWith('write:'))).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1_000); // first confirmation: still unconfirmed
    expect(parts.recordExists()).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000); // second: confirmed
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 50);

    expect(parts.recordExists()).toBe(false);
    expect(parts.writer.calls.filter((call) => call.startsWith('write:'))).toHaveLength(1); // still never rewritten
  });

  it('a newer edit while an older revision awaits confirmation is saved normally and keeps its own record', async () => {
    const parts = await openOnAtomicProvider();
    parts.writer.inject({ kind: 'durability-unconfirmed' });
    await edit(parts, 'revision one');

    parts.pageOperations.commitEdit(parts.page.id, 'revision two');
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 50);
    expect(parts.recordExists()).toBe(true);
    await parts.pageOperations.requestSave(parts.page.id);
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 50);

    expect(await parts.disk.readFile(parts.page.path)).toContain('revision two');
    expect(parts.session.state).toBe(DocumentState.Clean);
    // Revision one's confirmation answers "superseded" once the timer fires; nothing about it releases revision two.
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 50);
    expect(parts.tracker.hasPending(parts.page.path)).toBe(false);
    expect(parts.recordExists()).toBe(false);
  });

  it('a refusal that cannot change (read-only file) leaves the note dirty and recoverable, needing the user, and a later Retry saves it', async () => {
    const parts = await openOnAtomicProvider();
    let readOnly = true;
    const write = parts.writer.write.bind(parts.writer);
    const writeSpy = vi.spyOn(parts.writer, 'write').mockImplementation(async (attempt) =>
      readOnly
        ? { status: 'notCommitted', reason: 'readOnlyTarget', detail: 'the file is read-only', leftovers: [] }
        : write(attempt)
    );

    await edit(parts, 'Edited body');

    expect(parts.session.state).toBe(DocumentState.SaveError);
    expect(parts.session.isDirty).toBe(true);
    expect(parts.pageOperations.saveFailureStatus(parts.page.id)).toBe('needs-action');
    expect(parts.recordExists()).toBe(true);
    expect(await parts.disk.readFile(parts.page.path)).not.toContain('Edited body');
    await vi.advanceTimersByTimeAsync(10_000); // the edit's own autosave trigger may re-request once
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    // The edit's own autosave triggers may re-request a couple of times; the five-step backoff must not run.
    expect(writeSpy.mock.calls.length).toBeLessThan(SAVE_RETRY_DELAYS_MS.length);
    expect(parts.recordExists()).toBe(true);

    readOnly = false; // the user fixes the permission
    await parts.pageOperations.retrySave(parts.page.id);
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 50);

    expect(parts.session.state).toBe(DocumentState.Clean);
    expect(await parts.disk.readFile(parts.page.path)).toContain('Edited body');
    expect(parts.recordExists()).toBe(false);
  });

  it('a save that was in doubt and provably did not happen is retried automatically', async () => {
    const parts = await openOnAtomicProvider();
    parts.writer.inject({ kind: 'uncertain', takesEffect: false });

    await edit(parts, 'Edited body');
    expect(parts.pageOperations.saveFailureStatus(parts.page.id)).toBe('retry-scheduled');

    await vi.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[0]! + 50);
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 50);

    expect(parts.session.state).toBe(DocumentState.Clean);
    expect(await parts.disk.readFile(parts.page.path)).toContain('Edited body');
  });

  it('a save in doubt that cannot be inspected is not retried blindly; the next explicit save inspects first, then saves', async () => {
    const parts = await openOnAtomicProvider();
    let blind = true;
    const inspect = parts.writer.inspect.bind(parts.writer);
    vi.spyOn(parts.writer, 'inspect').mockImplementation(async (query) =>
      blind ? ({ status: 'failed', detail: 'cannot look' } satisfies InspectionResult) : inspect(query)
    );
    parts.writer.inject({ kind: 'uncertain', takesEffect: false });

    await edit(parts, 'Edited body');

    expect(parts.pageOperations.saveFailureStatus(parts.page.id)).toBe('needs-action');
    expect(parts.session.isDirty).toBe(true);
    expect(parts.recordExists()).toBe(true);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(parts.writer.calls.filter((call) => call.startsWith('write:'))).toHaveLength(1); // nothing repeated blindly

    blind = false;
    await parts.pageOperations.retrySave(parts.page.id);
    await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 50);

    expect(parts.session.state).toBe(DocumentState.Clean);
    expect(await parts.disk.readFile(parts.page.path)).toContain('Edited body');
    expect(parts.recordExists()).toBe(false);
  });

  it('a note deleted behind the app while it is unsaved is not re-created by the save, and stays recoverable', async () => {
    const parts = await openOnAtomicProvider();
    await parts.disk.deleteFile(parts.page.path);

    await edit(parts, 'Edited body');

    expect(await parts.disk.exists(parts.page.path)).toBe(false);
    expect(parts.session.isDirty).toBe(true);
    expect(parts.pageOperations.saveFailureStatus(parts.page.id)).toBe('needs-action');
    expect(parts.recordExists()).toBe(true);
  });
});
