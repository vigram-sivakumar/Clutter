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
import { contentIdentity } from '../../shared/identity/textFingerprint';
import { DocumentTransaction } from '../../engine/DocumentTransaction';
import type { InspectionResult } from '../../vault/atomicWrite/AtomicWriteContract';

/**
 * ADR-063, decision 13, end to end over the in-memory simulation: the user's edit goes through the real
 * PageOperations, Persistence Gate, atomic provider, durability tracker and crash-recovery journal. Each test names the
 * situation (a refusal, a save in doubt, a save installed with a flush gap) and what the user and the recovery record
 * must see.
 */
async function openOnAtomicProvider() {
  const seeded = buildPage();
  const seededText = new FrontmatterSerializer().serializeDocument(seeded, seeded.source.markdown);
  // As a scan would have built it: carrying the identity of the text on disk.
  const page = { ...seeded, sourceFingerprint: contentIdentity(seededText) };
  const disk = new InMemoryVaultFileSystem();
  disk.seedFile(page.path, seededText);
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
    expect(parts.writer.calls.some((call) => call.startsWith('write:replaceIfContent:'))).toBe(true); // conditional on what was read
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

  describe('an edit made in another application is never silently overwritten by the editor (ADR-063)', () => {
    const external = 'FRONTMATTER-KEPT\nExternal edit made in another application';

    async function externalEdit(parts: Awaited<ReturnType<typeof openOnAtomicProvider>>) {
      const text = `---\nid: ${parts.page.id}\n---\n${external}`;
      await parts.disk.writeFile(parts.page.path, text);

      return text;
    }

    /** What Sync does when it sees the edit: the Vault page follows the disk. The open, dirty session does not. */
    function syncSeesIt(parts: Awaited<ReturnType<typeof openOnAtomicProvider>>, text: string) {
      const parsed = new FrontmatterParser().parse(text);
      parts.vault.replacePage(new PageRebuilder().rebuild(parts.vault.getPage(parts.page.id)!, parsed, undefined, contentIdentity(text)));
    }

    it('external edit, autosave, more typing, autosave, Retry and a close-time flush: the disk keeps the external version throughout', async () => {
      const parts = await openOnAtomicProvider();
      parts.pageOperations.commitEdit(parts.page.id, 'my unsaved words');
      const text = await externalEdit(parts);
      syncSeesIt(parts, text); // the strongest case: the Vault already follows the disk

      await parts.pageOperations.requestSave(parts.page.id);
      expect(await parts.disk.readFile(parts.page.path)).toBe(text);
      expect(parts.pageOperations.saveFailureKind(parts.page.id)).toBe('changed-on-disk');
      expect(parts.pageOperations.saveFailureStatus(parts.page.id)).toBe('needs-action'); // no backoff retries
      expect(parts.session.isDirty).toBe(true);

      parts.pageOperations.commitEdit(parts.page.id, 'my unsaved words and a lot more');
      await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 2_500); // the autosave runs again
      await parts.pageOperations.requestSave(parts.page.id);
      await parts.pageOperations.retrySave(parts.page.id);
      await parts.pageOperations.flushAll(1_000);

      expect(await parts.disk.readFile(parts.page.path)).toBe(text); // never bypassed
      expect(parts.session.isDirty).toBe(true);
      expect(parts.session.currentRevision.markdown).toBe('my unsaved words and a lot more');
      expect(parts.recordExists()).toBe(true); // and the work stays protected
      expect(parts.writer.calls.filter((call) => call.startsWith('write:'))).toHaveLength(0);
    });

    it('the conflict survives navigating away and back, because the session keeps its base', async () => {
      const parts = await openOnAtomicProvider();
      parts.pageOperations.commitEdit(parts.page.id, 'my unsaved words');
      const text = await externalEdit(parts);
      await parts.pageOperations.requestSave(parts.page.id);

      await parts.pageOperations.open(parts.page.id); // opening again must not re-base the session on the disk
      parts.pageOperations.commitEdit(parts.page.id, 'my unsaved words, again');
      await parts.pageOperations.requestSave(parts.page.id);

      expect(await parts.disk.readFile(parts.page.path)).toBe(text);
      expect(parts.pageOperations.saveFailureKind(parts.page.id)).toBe('changed-on-disk');
    });

    it('Save as new note keeps the unsaved text in a new note, leaves the external version on disk, and ends the conflict', async () => {
      const parts = await openOnAtomicProvider();
      parts.pageOperations.setExternalReconciler(async (path) => {
        syncSeesIt(parts, await parts.disk.readFile(path));
      });
      parts.pageOperations.commitEdit(parts.page.id, 'my unsaved words');
      const text = await externalEdit(parts);
      await parts.pageOperations.requestSave(parts.page.id);
      parts.pageOperations.commitEdit(parts.page.id, 'my unsaved words and more');
      await parts.pageOperations.requestSave(parts.page.id);

      const copyId = await parts.pageOperations.saveUnsavedAsNewNote(parts.page.id);

      expect(copyId).not.toBeNull();
      expect(parts.vault.getPage(copyId!)?.source.markdown).toBe('my unsaved words and more');
      expect(await parts.disk.readFile(parts.page.path)).toBe(text); // the external version is untouched
      expect(parts.session.isDirty).toBe(false); // the original now follows the disk
      expect(parts.session.currentRevision.markdown).toBe(external);
      expect(parts.pageOperations.saveFailureKind(parts.page.id)).toBeNull();
      expect(parts.pageOperations.saveFailureStatus(parts.page.id)).toBeNull();

      // And editing the original afterwards saves normally on top of the version it now follows.
      parts.pageOperations.commitEdit(parts.page.id, 'continuing from the external version');
      await parts.pageOperations.requestSave(parts.page.id);
      expect(await parts.disk.readFile(parts.page.path)).toContain('continuing from the external version');
      expect(parts.pageOperations.saveFailureKind(parts.page.id)).toBeNull();
    });

    it('Clutter’s own metadata edit while the editor is dirty is not a conflict, keeps the unsaved text, and later saves still work', async () => {
      const parts = await openOnAtomicProvider();
      parts.pageOperations.commitEdit(parts.page.id, 'unsaved words');

      await parts.pageOperations.updateMetadata(parts.page.id, { description: 'a new description' });

      expect(await parts.disk.readFile(parts.page.path)).toContain('a new description');
      expect(parts.session.currentRevision.markdown).toBe('unsaved words'); // not overwritten, not lost
      expect(parts.session.isDirty).toBe(true);
      expect(parts.pageOperations.saveFailureKind(parts.page.id)).toBeNull();

      await parts.pageOperations.requestSave(parts.page.id);

      expect(parts.pageOperations.saveFailureKind(parts.page.id)).toBeNull();
      const onDisk = await parts.disk.readFile(parts.page.path);
      expect(onDisk).toContain('unsaved words');
      expect(onDisk).toContain('a new description');
    });

    it('a metadata edit does not overwrite an edit made elsewhere either', async () => {
      const parts = await openOnAtomicProvider();
      const text = await externalEdit(parts);
      syncSeesIt(parts, text);

      await expect(parts.pageOperations.updateMetadata(parts.page.id, { description: 'mine' })).rejects.toBeDefined();

      expect(await parts.disk.readFile(parts.page.path)).toBe(text);
    });

    it('a rename while the editor is dirty keeps the session in step, so the next body save is not a false conflict', async () => {
      const parts = await openOnAtomicProvider();
      parts.pageOperations.commitEdit(parts.page.id, 'unsaved words');

      await parts.pageOperations.rename(parts.page.id, 'Renamed');
      await parts.pageOperations.requestSave(parts.page.id);

      expect(parts.pageOperations.saveFailureKind(parts.page.id)).toBeNull();
      expect(await parts.disk.readFile(parts.vault.getPage(parts.page.id)!.path)).toContain('unsaved words');
    });

    it('typing during an in-flight save: the base becomes the text that was written, not the newer text, and the follow-up save is no conflict', async () => {
      const parts = await openOnAtomicProvider();
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const write = parts.writer.write.bind(parts.writer);
      const seenAtEachWrite: { base: string | undefined; onDisk: string }[] = [];
      vi.spyOn(parts.writer, 'write').mockImplementation(async (attempt) => {
        seenAtEachWrite.push({ base: parts.session.diskFingerprint, onDisk: contentIdentity(await parts.disk.readFile(attempt.path)) });
        if (seenAtEachWrite.length === 1) await held;

        return write(attempt);
      });

      parts.pageOperations.commitEdit(parts.page.id, 'first revision');
      const inFlight = parts.pageOperations.requestSave(parts.page.id);
      await vi.advanceTimersByTimeAsync(10);
      parts.pageOperations.commitEdit(parts.page.id, 'second revision, typed while saving');
      release();
      await inFlight; // the facade also saves the newer revision before it settles
      await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 50);

      // Two writes. When the second began, the session's base was the text the FIRST write installed (it equals what
      // was on disk then), not the newer editor text: so the second was not a conflict.
      expect(seenAtEachWrite).toHaveLength(2);
      expect(seenAtEachWrite[1]!.base).toBe(seenAtEachWrite[1]!.onDisk);
      expect(parts.pageOperations.saveFailureKind(parts.page.id)).toBeNull();
      const finalText = await parts.disk.readFile(parts.page.path);
      expect(finalText).toContain('second revision, typed while saving');
      expect(parts.session.diskFingerprint).toBe(contentIdentity(finalText));
      expect(parts.session.isDirty).toBe(false);
    });

    describe('Save as new note when the copy cannot be made', () => {
      it.each([
        ['the disk is full', 'insufficientSpace'],
        ['the name is taken', 'destinationExists'],
        ['the write is refused', 'readOnlyTarget'],
      ] as const)('%s: the original session, the unsaved text and the recovery record are all left intact, and the error reaches the caller', async (_name, reason) => {
        const parts = await openOnAtomicProvider();
        parts.pageOperations.setExternalReconciler(async (path) => syncSeesIt(parts, await parts.disk.readFile(path)));
        parts.pageOperations.commitEdit(parts.page.id, 'my unsaved words');
        const text = await externalEdit(parts);
        await vi.advanceTimersByTimeAsync(RECOVERY_DEBOUNCE_MS + 50);
        await parts.pageOperations.requestSave(parts.page.id);
        const pagesBefore = [...parts.vault.pages()].length;
        const write = parts.writer.write.bind(parts.writer);
        vi.spyOn(parts.writer, 'write').mockImplementation(async (attempt) =>
          attempt.intent.kind === 'create'
            ? { status: 'notCommitted', reason, detail: 'injected', leftovers: [] }
            : write(attempt)
        );

        await expect(parts.pageOperations.saveUnsavedAsNewNote(parts.page.id)).rejects.toBeDefined();

        expect(parts.session.isDirty).toBe(true);
        expect(parts.session.currentRevision.markdown).toBe('my unsaved words');
        expect(parts.pageOperations.saveFailureKind(parts.page.id)).toBe('changed-on-disk');
        expect(parts.recordExists()).toBe(true);
        expect(await parts.disk.readFile(parts.page.path)).toBe(text);
        expect([...parts.vault.pages()].length).toBe(pagesBefore);
      });

      it('the copy is a new page with its own id, written create-only, so it can never replace an existing note', async () => {
        const parts = await openOnAtomicProvider();
        parts.pageOperations.setExternalReconciler(async (path) => syncSeesIt(parts, await parts.disk.readFile(path)));
        parts.pageOperations.commitEdit(parts.page.id, 'my unsaved words');
        await externalEdit(parts);
        await parts.pageOperations.requestSave(parts.page.id);

        const copyId = await parts.pageOperations.saveUnsavedAsNewNote(parts.page.id);

        expect(copyId).not.toBe(parts.page.id);
        const copyPath = parts.vault.getPage(copyId!)!.path;
        expect(copyPath).not.toBe(parts.page.path);
        expect(parts.writer.calls).toContain(`write:create:${copyPath}`);
      });
    });

    it('a note nobody else touched keeps saving, edit after edit', async () => {
      const parts = await openOnAtomicProvider();

      for (const text of ['one', 'two', 'three']) {
        parts.pageOperations.commitEdit(parts.page.id, text);
        await parts.pageOperations.requestSave(parts.page.id);
      }

      expect(await parts.disk.readFile(parts.page.path)).toContain('three');
      expect(parts.pageOperations.saveFailureKind(parts.page.id)).toBeNull();
    });

    it('an external edit that Sync applied to a CLEAN session moves the session’s base, so the next save is not a false conflict', async () => {
      const parts = await openOnAtomicProvider();
      const text = await externalEdit(parts);
      syncSeesIt(parts, text);
      // What VaultSyncService.convergeOpenSession does for a clean session.
      parts.session.markSaved(parts.session.commit(new DocumentTransaction(external)));
      parts.session.diskFingerprint = parts.vault.getPage(parts.page.id)!.sourceFingerprint;

      parts.pageOperations.commitEdit(parts.page.id, 'typing on top of the external version');
      await parts.pageOperations.requestSave(parts.page.id);

      expect(await parts.disk.readFile(parts.page.path)).toContain('typing on top of the external version');
      expect(parts.pageOperations.saveFailureKind(parts.page.id)).toBeNull();
    });
  });
});
