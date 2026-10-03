import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: vi.fn().mockReturnValue(false),
}));

import type { CoverImageUrlResolver } from '../vault/providers/CoverImageUrlResolver';
import { Application } from './Application';
import { PageCreator } from './page/PageCreator';
import { PageFactory } from './page/PageFactory';
import { DailyNoteService } from './daily-notes/DailyNoteService';
import { UuidGenerator } from '../shared/identity/UuidGenerator';
import { Vault } from '../vault/models/Vault';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';

function setRootPath(application: Application, rootPath: string): void {
  Reflect.set(application, 'rootPath', rootPath);
}

function makeVault(root: string): Vault {
  return new Vault(
    root,
    [],
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

describe('Application.resolveCoverImageForDisplay', () => {
  const vaultRoot = '/vault';

  function createApplication(resolver: CoverImageUrlResolver): Application {
    const application = new Application(
      makeVault(vaultRoot),
      new InMemoryVaultFileSystem(),
      new SelfWriteRegistry(),
      resolver
    );
    setRootPath(application, vaultRoot);
    return application;
  }

  it('passes external URLs through unchanged', () => {
    const application = createApplication({
      toLoadableUrl: (path) => path,
    });

    expect(
      application.resolveCoverImageForDisplay('https://example.com/cover.png')
    ).toBe('https://example.com/cover.png');
  });

  it('resolves vault-local Assets/ references through the platform resolver', () => {
    const application = createApplication({
      toLoadableUrl: (path) => `loadable:${path}`,
    });

    expect(application.resolveCoverImageForDisplay('Assets/photo.png')).toBe(
      'loadable:/vault/Assets/photo.png'
    );
  });

  it('returns null for a null cover', () => {
    const application = createApplication({
      toLoadableUrl: (path) => path,
    });

    expect(application.resolveCoverImageForDisplay(null)).toBeNull();
  });

  it('passes through other stored references unchanged', () => {
    const application = createApplication({
      toLoadableUrl: (path) => path,
    });

    expect(application.resolveCoverImageForDisplay('/vault/cover.png')).toBe(
      '/vault/cover.png'
    );
  });
});

describe('Application.importCoverAsset', () => {
  it('delegates to importCoverAsset using the application filesystem', async () => {
    const vaultRoot = '/vault';
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile('/external/photo.png', 'bytes');
    const application = new Application(
      makeVault(vaultRoot),
      fileSystem,
      new SelfWriteRegistry(),
      { toLoadableUrl: (path) => path }
    );
    setRootPath(application, vaultRoot);
    await fileSystem.createDirectory(vaultRoot);
    application.attachVault(
      application.vault,
      new PageCreator(new UuidGenerator(), new PageFactory()),
      new DailyNoteService()
    );

    const reference = await application.importCoverAsset('/external/photo.png');

    expect(reference).toBe('Assets/photo.png');
    expect(fileSystem.getFileSync(`${vaultRoot}/Assets/photo.png`)).toBe('bytes');
    // Registered in the Vault immediately — no watcher event involved (a copy's
    // single echo is suppressed as a self-write).
    expect(application.vault.getResourceByPath(`${vaultRoot}/Assets/photo.png`)).toBeDefined();
  });
});
