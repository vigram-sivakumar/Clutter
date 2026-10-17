import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

import { Application } from './Application';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { Vault } from '../vault/models/Vault';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import type { VaultFileChange } from '../vault/providers/VaultFileSystemWatcher';

interface Internals {
  rootPath: string;
  isRootConfirmedMissing: (path: string) => Promise<boolean>;
  sealFileSystem: (() => void) | null;
  fileSystemWatcher: { listeners: Set<(change: VaultFileChange) => void> };
  workspaceSessionStore: { flush: () => Promise<void>; dispose: () => void };
  vaultSyncService: { dispose: () => void };
  saveCoordinator: { cancelAllTimers: () => void };
  pageOperations: { flushAll: (timeout: number) => Promise<void> };
  folderOperations: { flushAll: (timeout: number) => Promise<void> };
}

function setup(isMissing: (path: string) => Promise<boolean>) {
  const vault = new Vault('/vault', [], [], [], [], [], new KnowledgeGraph([]), new VaultProjectionBuilder());
  const application = new Application(vault, new InMemoryVaultFileSystem(), new SelfWriteRegistry());
  application.attachVault(vault, new PageCreator(new UuidGenerator(), new PageFactory()), new DailyNoteService());
  const internals = application as unknown as Internals;
  internals.rootPath = '/vault';
  internals.isRootConfirmedMissing = isMissing;
  const seal = vi.fn();
  internals.sealFileSystem = seal;
  const lost = vi.fn();
  application.onRootLost(lost);
  return { application, internals, seal, lost };
}

const emit = (internals: Internals, change: VaultFileChange) =>
  internals.fileSystemWatcher.listeners.forEach((listener) => listener(change));

let missing: boolean;
const isMissing = vi.fn(async () => missing);

beforeEach(() => {
  missing = false;
  isMissing.mockClear();
});

describe('Application.verifyRoot: detecting that the vault root is gone', () => {
  it('reports the loss once, and seals the filesystem and stops background work first', async () => {
    const { application, internals, seal, lost } = setup(isMissing);
    const order: string[] = [];
    seal.mockImplementation(() => order.push('seal'));
    vi.spyOn(internals.workspaceSessionStore, 'dispose').mockImplementation(() => void order.push('session'));
    vi.spyOn(internals.saveCoordinator, 'cancelAllTimers').mockImplementation(() => void order.push('timers'));
    vi.spyOn(internals.vaultSyncService, 'dispose').mockImplementation(() => void order.push('sync'));
    lost.mockImplementation(() => order.push('notify'));
    missing = true;

    await application.verifyRoot();
    await application.verifyRoot();

    expect(lost).toHaveBeenCalledTimes(1);
    expect(application.isRootLost()).toBe(true);
    expect(order).toEqual(['seal', 'session', 'timers', 'sync', 'notify']);
  });

  it('does nothing while the root exists, or when the check says anything other than "confirmed missing"', async () => {
    const { application, seal, lost } = setup(isMissing);

    await application.verifyRoot(); // exists
    expect(lost).not.toHaveBeenCalled();

    // A permission/scope/other I/O failure is "not confirmed missing" (the classifier is tested with the probe).
    const unrelated = setup(async () => false);
    await unrelated.application.verifyRoot();
    expect(unrelated.lost).not.toHaveBeenCalled();
    expect(unrelated.seal).not.toHaveBeenCalled();
    expect(seal).not.toHaveBeenCalled();
    expect(application.isRootLost()).toBe(false);
  });

  it('shares one check between concurrent callers', async () => {
    const { application } = setup(isMissing);
    await Promise.all([application.verifyRoot(), application.verifyRoot(), application.verifyRoot()]);
    expect(isMissing).toHaveBeenCalledTimes(1);
  });

  it.each<VaultFileChange>([
    { type: 'deleted', path: 'Notes/a.md' },
    { type: 'moved', fromPath: 'a.md', toPath: 'b.md' },
  ])('treats a watcher "%s" event only as a hint to run that same check', async (change) => {
    const { internals, lost } = setup(isMissing);
    missing = true;

    emit(internals, change);
    await vi.waitFor(() => expect(lost).toHaveBeenCalledTimes(1));
    expect(isMissing).toHaveBeenCalledWith('/vault');
  });

  it('ignores watcher events that cannot mean the root is gone', async () => {
    const { internals } = setup(isMissing);
    emit(internals, { type: 'changed', path: 'a.md' });
    emit(internals, { type: 'created', path: 'b.md', isDirectory: false });
    await Promise.resolve();
    expect(isMissing).not.toHaveBeenCalled();
  });

  it('does not rely on the watcher: a plain verifyRoot() (window focus) finds the loss by itself', async () => {
    const { application, lost } = setup(isMissing);
    missing = true;
    await application.verifyRoot();
    expect(lost).toHaveBeenCalledTimes(1);
  });
});

describe('Application.close after the root was lost', () => {
  it('skips every flush (nothing to write to) but still tears everything down, once', async () => {
    const { application, internals } = setup(isMissing);
    const flushSession = vi.spyOn(internals.workspaceSessionStore, 'flush');
    const flushPages = vi.spyOn(internals.pageOperations, 'flushAll');
    const flushFolders = vi.spyOn(internals.folderOperations, 'flushAll');
    missing = true;
    await application.verifyRoot();

    await application.close();
    await application.close();

    expect(flushSession).not.toHaveBeenCalled();
    expect(flushPages).not.toHaveBeenCalled();
    expect(flushFolders).not.toHaveBeenCalled();
  });

  it('a normal close still flushes', async () => {
    const { application, internals } = setup(isMissing);
    const flushSession = vi.spyOn(internals.workspaceSessionStore, 'flush');
    const flushPages = vi.spyOn(internals.pageOperations, 'flushAll');

    await application.close();

    expect(flushSession).toHaveBeenCalledTimes(1);
    expect(flushPages).toHaveBeenCalledTimes(1);
  });

  it('is inert afterwards: no more loss reports, no more checks, no watcher hints', async () => {
    const { application, internals, lost } = setup(isMissing);
    await application.close();
    missing = true;

    await application.verifyRoot();
    emit(internals, { type: 'deleted', path: 'a.md' });
    await Promise.resolve();

    expect(isMissing).not.toHaveBeenCalled();
    expect(lost).not.toHaveBeenCalled();
  });
});
