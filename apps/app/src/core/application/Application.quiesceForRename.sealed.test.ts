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
import { LostableVaultFileSystem } from '../vault/testing/LostableVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { VaultRootMissingError } from '../vault/providers/VaultRootMissingError';
import { mergeAndWriteWorkspaceStateFile } from '../vault/initialize/workspaceStateFile';

/**
 * The real Application, Gate and stores over a filesystem that refuses every mutation once sealed (the way
 * `LocalVaultProvider.seal()` does), with the seal wired to `quiesceForRename`. Nothing about what is dirty or
 * queued is stubbed here: this is the "once sealed, nothing can write" half, through the Application's own paths.
 */
function setup() {
  const fileSystem = new LostableVaultFileSystem('/vault');
  const vault = new Vault('/vault', [], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const application = new Application(vault, fileSystem, new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  const internals = application as unknown as {
    rootPath: string;
    sealFileSystem: (() => void) | null;
    persistenceCoordinator: import('../vault/persistence/PagePersistenceCoordinator').PagePersistenceCoordinator;
  };
  internals.rootPath = '/vault';
  internals.sealFileSystem = () => fileSystem.lose();

  return { application, fileSystem, internals };
}

describe('Application: once sealed for a rename, nothing can write', () => {
  it('refuses a Gate write for a page, and nothing lands on disk', async () => {
    const { application, fileSystem, internals } = setup();
    expect(await application.quiesceForRename()).toEqual({ ok: true });
    const before = { ...fileSystem.landed };

    await expect(
      internals.persistenceCoordinator.enqueue('late-page', {
        kind: 'create',
        path: '/vault/Late.md',
        parentId: null,
        content: '---\nid: late-page\n---\nbody',
      })
    ).rejects.toBeInstanceOf(VaultRootMissingError);

    expect(fileSystem.landed).toEqual(before);
    expect(await fileSystem.exists('/vault/Late.md')).toBe(false);
  });

  it('refuses every import and the remote image save with SpaceQuiescedError', async () => {
    const { application } = setup();
    await application.quiesceForRename();

    await expect(application.importAsset('/tmp/a.png')).rejects.toBeInstanceOf(SpaceQuiescedError);
    await expect(application.importPastedAsset('a.png', 'image/png', new Uint8Array())).rejects.toBeInstanceOf(
      SpaceQuiescedError
    );
    await expect(application.importCoverAsset('/tmp/a.png')).rejects.toBeInstanceOf(SpaceQuiescedError);
    await expect(application.saveRemoteImageToVault('https://example.com/a.png')).rejects.toBeInstanceOf(
      SpaceQuiescedError
    );
  });

  it('runs no archive cleanup and writes no parsed-note cache', async () => {
    const { application } = setup();
    await application.quiesceForRename();
    const cache = (application as unknown as { parsedNoteCache: { persist: () => Promise<unknown> } }).parsedNoteCache;
    const persist = vi.spyOn(cache, 'persist').mockResolvedValue({});

    expect(await application.purgeExpiredArchivedItems()).toBe(0);
    await application.persistParsedNoteCache();

    expect(persist).not.toHaveBeenCalled();
  });

  it('a workspace-state write after the seal does not land (and is dropped quietly, as for a lost vault)', async () => {
    const { application, fileSystem } = setup();
    await application.quiesceForRename();
    const before = { ...fileSystem.landed };

    await mergeAndWriteWorkspaceStateFile(fileSystem, '/vault', { late: true });

    expect(fileSystem.landed).toEqual(before);
  });

  it('closing it afterwards writes nothing either', async () => {
    const { application, fileSystem } = setup();
    await application.quiesceForRename();
    const before = { ...fileSystem.landed };

    await application.close();

    expect(fileSystem.landed).toEqual(before);
  });

  it('a quiesce that gives up leaves writes admitted and landing normally', async () => {
    const { application, fileSystem, internals } = setup();
    vi.spyOn(internals.persistenceCoordinator, 'hasPendingOperations').mockReturnValue(true);
    vi.spyOn(internals.persistenceCoordinator, 'whenIdle').mockResolvedValue(undefined);

    expect(await application.quiesceForRename({ timeoutMs: 50 })).toEqual({ ok: false, reason: 'unsaved' });

    await mergeAndWriteWorkspaceStateFile(fileSystem, '/vault', { stillWorks: true });
    expect(fileSystem.landed.writeFile).toBeGreaterThan(0);
  });
});
