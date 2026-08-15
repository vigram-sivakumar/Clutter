import { describe, expect, it } from 'vitest';

import type { CoverImageUrlResolver } from '../vault/providers/CoverImageUrlResolver';
import { Application } from './Application';
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

    const reference = await application.importCoverAsset('/external/photo.png');

    expect(reference).toBe('Assets/photo.png');
    expect(fileSystem.getFileSync(`${vaultRoot}/Assets/photo.png`)).toBe('bytes');
  });
});
