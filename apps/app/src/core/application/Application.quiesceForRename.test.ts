import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

import { Application, SpaceQuiescedError } from './Application';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { Vault } from '../vault/models/Vault';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';

/**
 * The state `quiesceForRename` reads, stubbed so each test can say what is dirty, queued or in flight and when it
 * clears. The real owners (Gate, page and folder operations, the session store) have their own tests.
 */
interface Internals {
  rootPath: string;
  sealFileSystem: (() => void) | null;
  writeAdmission: 'open' | 'quiescing' | 'sealed';
  persistenceCoordinator: { hasPendingOperations: () => boolean; whenIdle: () => Promise<void> };
  workspaceSessionStore: { flush: () => Promise<void>; hasPendingWrite: () => boolean; dispose: () => void };
  pageOperations: { flushAll: (timeout: number) => Promise<void>; hasUnsavedWork: () => boolean; dispose: () => void };
  folderOperations: { flushAll: (timeout: number) => Promise<void>; hasUnsavedWork: () => boolean };
  fileSystemWatcher: { stop: () => Promise<void> };
  vaultSyncService: { dispose: () => void };
  saveCoordinator: { cancelAllTimers: () => void };
  effectivePageState: { dispose: () => void };
  documentRegistry: { clear: () => void };
  workspaceVaultReconciliationUnsubscribe: () => void;
}

function setup() {
  const vault = new Vault('/vault', [], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const application = new Application(vault, new InMemoryVaultFileSystem(), new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  const internals = application as unknown as Internals;
  internals.rootPath = '/vault';
  const seal = vi.fn();
  internals.sealFileSystem = seal;

  const state = { unsavedPages: false, unsavedFolders: false, gatePending: false, sessionPending: false };
  vi.spyOn(internals.pageOperations, 'hasUnsavedWork').mockImplementation(() => state.unsavedPages);
  vi.spyOn(internals.folderOperations, 'hasUnsavedWork').mockImplementation(() => state.unsavedFolders);
  vi.spyOn(internals.persistenceCoordinator, 'hasPendingOperations').mockImplementation(() => state.gatePending);
  vi.spyOn(internals.persistenceCoordinator, 'whenIdle').mockResolvedValue(undefined);
  vi.spyOn(internals.workspaceSessionStore, 'hasPendingWrite').mockImplementation(() => state.sessionPending);
  const pageFlush = vi.spyOn(internals.pageOperations, 'flushAll').mockResolvedValue(undefined);
  const folderFlush = vi.spyOn(internals.folderOperations, 'flushAll').mockResolvedValue(undefined);
  vi.spyOn(internals.workspaceSessionStore, 'flush').mockResolvedValue(undefined);

  return { application, internals, seal, state, pageFlush, folderFlush };
}

describe('Application.quiesceForRename', () => {
  it('flushes, verifies that nothing is left, then seals — and from then on the Application only closes', async () => {
    const { application, internals, seal, pageFlush, folderFlush } = setup();

    const result = await application.quiesceForRename();

    expect(result).toEqual({ ok: true });
    expect(pageFlush).toHaveBeenCalled();
    expect(folderFlush).toHaveBeenCalled();
    expect(seal).toHaveBeenCalledOnce();
    expect(internals.writeAdmission).toBe('sealed');
  });

  it('seals in the same tick as the final check: nothing can start between "verified clean" and the seal', async () => {
    const { application, internals, seal } = setup();
    const events: string[] = [];
    // The last thing the check reads. A microtask queued here would run before any later `await`.
    vi.spyOn(internals.workspaceSessionStore, 'hasPendingWrite').mockImplementation(() => {
      void Promise.resolve().then(() => events.push('microtask'));
      events.push('checked');
      return false;
    });
    seal.mockImplementation(() => events.push('sealed'));

    await application.quiesceForRename();
    await Promise.resolve();

    expect(events.slice(0, 3)).toEqual(['checked', 'sealed', 'microtask']);
  });

  it('refuses imports from the moment it starts, and an import already running is finished before sealing', async () => {
    const { application, seal } = setup();
    let finishImport!: () => void;
    const running = new Promise<string>((resolve) => (finishImport = () => resolve('Assets/a.png')));
    const runImport = vi
      .spyOn(application as unknown as { runImportAsset: () => Promise<string> }, 'runImportAsset')
      .mockReturnValue(running);
    const pending = application.importAsset('/tmp/a.png');
    expect(runImport).toHaveBeenCalledOnce();

    const quiescing = application.quiesceForRename({ timeoutMs: 2000 });
    await new Promise((resolve) => setTimeout(resolve, 10));

    await expect(application.importPastedAsset('x.png', 'image/png', new Uint8Array())).rejects.toBeInstanceOf(
      SpaceQuiescedError
    );
    await expect(application.importCoverAsset('/tmp/b.png')).rejects.toBeInstanceOf(SpaceQuiescedError);
    expect(seal).not.toHaveBeenCalled(); // the running import is not abandoned

    finishImport();
    await pending;

    expect(await quiescing).toEqual({ ok: true });
    expect(seal).toHaveBeenCalledOnce();
  });

  it('refuses archive cleanup while it runs and after it has sealed', async () => {
    const { application } = setup();

    const quiescing = application.quiesceForRename();
    expect(await application.purgeExpiredArchivedItems()).toBe(0);
    await quiescing;
    expect(await application.purgeExpiredArchivedItems()).toBe(0);
  });

  it('goes round again when something becomes dirty during the drain, and seals only once it is clean', async () => {
    const { application, seal, state, pageFlush } = setup();
    let flushes = 0;
    pageFlush.mockImplementation(async () => {
      flushes++;
      // The first flush leaves a late edit behind; the second finds it saved.
      state.unsavedPages = flushes === 1;
    });
    state.unsavedPages = true;

    const result = await application.quiesceForRename({ timeoutMs: 2000 });

    expect(result).toEqual({ ok: true });
    expect(flushes).toBe(2);
    expect(seal).toHaveBeenCalledOnce();
  });

  it.each([
    ['an unsaved page', (s: ReturnType<typeof setup>['state']) => (s.unsavedPages = true)],
    ['an unsaved folder change', (s: ReturnType<typeof setup>['state']) => (s.unsavedFolders = true)],
    ['a queued Gate operation', (s: ReturnType<typeof setup>['state']) => (s.gatePending = true)],
    ['a pending session write', (s: ReturnType<typeof setup>['state']) => (s.sessionPending = true)],
  ])('with %s that never clears, gives up unsealed and leaves the Application open', async (_label, dirty) => {
    const { application, internals, seal, state } = setup();
    dirty(state);

    const result = await application.quiesceForRename({ timeoutMs: 80 });

    expect(result).toEqual({ ok: false, reason: 'unsaved' });
    expect(seal).not.toHaveBeenCalled();
    expect(internals.writeAdmission).toBe('open');
  });

  it('after giving up, admits work again and can be tried again', async () => {
    const { application, seal, state } = setup();
    state.unsavedPages = true;
    await application.quiesceForRename({ timeoutMs: 40 });
    vi.spyOn(application as unknown as { runImportAsset: () => Promise<string> }, 'runImportAsset').mockResolvedValue(
      'Assets/a.png'
    );

    await expect(application.importAsset('/tmp/a.png')).resolves.toBe('Assets/a.png');

    state.unsavedPages = false;
    expect(await application.quiesceForRename()).toEqual({ ok: true });
    expect(seal).toHaveBeenCalledOnce();
  });

  it('restores admission and rethrows if the drain itself throws, so it can never be left half-closed', async () => {
    const { application, internals, seal } = setup();
    vi.spyOn(internals.persistenceCoordinator, 'whenIdle').mockRejectedValue(new Error('boom'));

    await expect(application.quiesceForRename()).rejects.toThrow('boom');

    expect(internals.writeAdmission).toBe('open');
    expect(seal).not.toHaveBeenCalled();
  });

  it('can be cancelled before it seals', async () => {
    const { application, seal, state } = setup();
    state.unsavedPages = true;
    const controller = new AbortController();

    const result = application.quiesceForRename({ timeoutMs: 5000, signal: controller.signal });
    controller.abort();

    expect(await result).toEqual({ ok: false, reason: 'cancelled' });
    expect(seal).not.toHaveBeenCalled();
  });

  it('is refused where there is no local filesystem to seal, when already preparing, and once closed', async () => {
    const none = setup();
    none.internals.sealFileSystem = null;
    expect(await none.application.quiesceForRename()).toEqual({ ok: false, reason: 'unsupported' });

    const twice = setup();
    twice.state.unsavedPages = true;
    const first = twice.application.quiesceForRename({ timeoutMs: 60 });
    expect(await twice.application.quiesceForRename()).toEqual({ ok: false, reason: 'busy' });
    await first;

    const closed = setup();
    await closed.application.close();
    expect(await closed.application.quiesceForRename()).toEqual({ ok: false, reason: 'busy' });
  });

  it('closing a sealed Application does not flush again and does not write', async () => {
    const { application, pageFlush, folderFlush, internals } = setup();
    await application.quiesceForRename();
    pageFlush.mockClear();
    folderFlush.mockClear();
    const sessionFlush = vi.spyOn(internals.workspaceSessionStore, 'flush');
    sessionFlush.mockClear();

    await application.close();

    expect(pageFlush).not.toHaveBeenCalled();
    expect(folderFlush).not.toHaveBeenCalled();
    expect(sessionFlush).not.toHaveBeenCalled();
  });

  it('a normal close of an Application that was never quiesced still flushes', async () => {
    const { application, pageFlush } = setup();

    await application.close();

    expect(pageFlush).toHaveBeenCalledOnce();
  });
});
