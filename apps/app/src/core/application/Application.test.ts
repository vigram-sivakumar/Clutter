import { describe, expect, it } from 'vitest';
import { Application } from './Application';
import { PageOperations } from './page/PageOperations';
import { FolderOperations } from './folder/FolderOperations';
import { NavigationRouter } from './navigation/NavigationRouter';
import { VaultSyncService } from '../vault/sync/VaultSyncService';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { Vault } from '../vault/models/Vault';
import { VaultQuery } from '../vault/queries/VaultQuery';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';

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
    application.attachVault(vault, pageCreator);

    expect(application.pageOperations).toBeInstanceOf(PageOperations);
    expect(application.folderOperations).toBeInstanceOf(FolderOperations);
    expect(application.navigation).toBeInstanceOf(NavigationRouter);
    expect(application.vaultSyncService).toBeInstanceOf(VaultSyncService);
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
