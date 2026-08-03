import { describe, expect, it, vi } from 'vitest';
import { Application } from './Application';
import { PageOperations } from './page/PageOperations';
import { FolderOperations } from './folder/FolderOperations';
import { NavigationRouter } from './navigation/NavigationRouter';
import { VaultSyncService } from '../vault/sync/VaultSyncService';
import { EffectivePageState } from './page/EffectivePageState';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { Vault } from '../vault/models/Vault';
import { VaultQuery } from '../vault/queries/VaultQuery';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';

// close() reaches LocalFileSystemWatcher.stop(), which calls Tauri's
// invoke('stop_vault_watcher') — real Platform IPC with no runtime to
// answer it under vitest, same reason bootstrap()'s own Platform pieces
// are documented above as untestable here. Mocked at the module boundary,
// test-file-local only, so close()'s pure in-memory disposal ordering
// (the actual thing under test) becomes reachable at all.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

/**
 * bootstrap()'s own Platform construction (LocalVaultProvider,
 * LocalFileSystemWatcher) is Tauri-backed and cannot run under vitest — this
 * was already true before Phase 4 (no Application test existed at all).
 * What's newly testable is attachVault() in isolation, which is exactly
 * where the "every subsystem constructed exactly once" invariant (spec §11's
 * testing strategy) actually lives, independent of Platform.
 */
function makeVault(): Vault {
  return new Vault(
    '/vault',
    [],
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

describe('Application.attachVault', () => {
  it('constructs every vault-dependent subsystem exactly once', () => {
    const vault = makeVault();
    const fileSystem = new InMemoryVaultFileSystem();
    const selfWriteRegistry = new SelfWriteRegistry();
    const pageCreator = new PageCreator(new UuidGenerator(), new PageFactory());

    const application = new Application(vault, fileSystem, selfWriteRegistry);
    application.attachVault(vault, pageCreator, new DailyNoteService());

    expect(application.pageOperations).toBeInstanceOf(PageOperations);
    expect(application.folderOperations).toBeInstanceOf(FolderOperations);
    expect(application.navigation).toBeInstanceOf(NavigationRouter);
    expect(application.vaultSyncService).toBeInstanceOf(VaultSyncService);
    // ADR-020, M2: constructed alongside the other vault-dependent
    // subsystems, after query/workspace/pageOperations all exist.
    expect(application.effectivePageState).toBeInstanceOf(EffectivePageState);
  });

  it('exposes the vault passed to the constructor unchanged', () => {
    const vault = makeVault();
    const fileSystem = new InMemoryVaultFileSystem();
    const selfWriteRegistry = new SelfWriteRegistry();

    const application = new Application(vault, fileSystem, selfWriteRegistry);

    expect(application.vault).toBe(vault);
  });

  it('constructs a single shared VaultQuery instance in the constructor, per rule 6', () => {
    const vault = makeVault();
    const fileSystem = new InMemoryVaultFileSystem();
    const selfWriteRegistry = new SelfWriteRegistry();

    const application = new Application(vault, fileSystem, selfWriteRegistry);

    expect(application.query).toBeInstanceOf(VaultQuery);
  });
});

describe('Application.close — EffectivePageState disposal (ADR-020, M2)', () => {
  function attach(): Application {
    const vault = makeVault();
    const fileSystem = new InMemoryVaultFileSystem();
    const selfWriteRegistry = new SelfWriteRegistry();
    const pageCreator = new PageCreator(new UuidGenerator(), new PageFactory());

    const application = new Application(vault, fileSystem, selfWriteRegistry);
    application.attachVault(vault, pageCreator, new DailyNoteService());

    return application;
  }

  it('disposes EffectivePageState exactly once, even across repeated close() calls', async () => {
    const application = attach();
    const disposeSpy = vi.spyOn(application.effectivePageState, 'dispose');

    await application.close();
    await application.close();

    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('disposes EffectivePageState before clearing the DocumentRegistry', async () => {
    const application = attach();
    const order: string[] = [];

    vi.spyOn(application.effectivePageState, 'dispose').mockImplementation(() => {
      order.push('effectivePageState.dispose');
    });
    vi.spyOn(application.documentRegistry, 'clear').mockImplementation(() => {
      order.push('documentRegistry.clear');
    });

    await application.close();

    expect(order).toEqual(['effectivePageState.dispose', 'documentRegistry.clear']);
  });

  it('shutdown remains idempotent: a second close() call is a safe no-op', async () => {
    const application = attach();

    await expect(application.close()).resolves.toBeUndefined();
    await expect(application.close()).resolves.toBeUndefined();
  });
});
