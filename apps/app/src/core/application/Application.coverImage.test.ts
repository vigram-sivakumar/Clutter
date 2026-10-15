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
import type { VaultResource } from '../vault/models/VaultResource';
import { InMemoryVaultFileSystem } from '../vault/testing/InMemoryVaultFileSystem';
import { SelfWriteRegistry } from '../vault/providers/SelfWriteRegistry';
import { KnowledgeGraph } from '../vault/models/graph/KnowledgeGraph';
import { VaultProjectionBuilder } from '../vault/knowledge/VaultProjectionBuilder';

function setRootPath(application: Application, rootPath: string): void {
  Reflect.set(application, 'rootPath', rootPath);
}

function makeVault(root: string, resources: VaultResource[] = []): Vault {
  return new Vault(
    root,
    [],
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    resources
  );
}

function makeImageResource(id: string, path: string): VaultResource {
  return { id, kind: 'image', name: path.slice(path.lastIndexOf('/') + 1), path, parentId: null };
}

describe('Application.resolveCoverImageForDisplay', () => {
  const vaultRoot = '/vault';

  function createApplication(
    resolver: CoverImageUrlResolver,
    resources: VaultResource[] = []
  ): Application {
    const application = new Application(
      makeVault(vaultRoot, resources),
      new InMemoryVaultFileSystem(),
      new SelfWriteRegistry(),
      resolver
    );
    setRootPath(application, vaultRoot);
    return application;
  }

  const loadable: CoverImageUrlResolver = { toLoadableUrl: (path) => `loadable:${path}` };
  const photo = makeImageResource('r1', '/vault/Assets/photo.png');

  it('passes external URLs through unchanged', () => {
    const application = createApplication({
      toLoadableUrl: () => {
        throw new Error('external URLs must not be resolved');
      },
    });

    expect(
      application.resolveCoverImageForDisplay('https://example.com/cover.png')
    ).toBe('https://example.com/cover.png');
  });

  it('resolves a vault-local reference to a file the Vault holds through the platform resolver', () => {
    const application = createApplication(loadable, [photo]);

    expect(application.resolveCoverImageForDisplay('Assets/photo.png')).toBe(
      'loadable:/vault/Assets/photo.png'
    );
  });

  it('matches the Vault file case-insensitively, as the disk the loader reads does', () => {
    const application = createApplication(loadable, [photo]);

    expect(application.resolveCoverImageForDisplay('assets/PHOTO.png')).toBe(
      'loadable:/vault/assets/PHOTO.png'
    );
  });

  it('returns null, never a loadable URL, for a vault-local reference the Vault does not hold', () => {
    const resolver = vi.fn((path: string) => `loadable:${path}`);
    const application = createApplication({ toLoadableUrl: resolver });

    expect(application.resolveCoverImageForDisplay('Assets/photo.png')).toBeNull();
    expect(resolver).not.toHaveBeenCalled();
  });

  it('stops resolving once the asset is permanently deleted, for every note that references it', () => {
    const vault = makeVault(vaultRoot, [photo]);
    const application = new Application(
      vault,
      new InMemoryVaultFileSystem(),
      new SelfWriteRegistry(),
      loadable
    );
    setRootPath(application, vaultRoot);
    const cover = 'Assets/photo.png';

    expect(application.resolveCoverImageForDisplay(cover)).not.toBeNull();

    vault.removeResource(photo.id);

    // Two notes (and a folder) sharing the reference all see the same answer.
    expect(application.resolveCoverImageForDisplay(cover)).toBeNull();
    expect(application.resolveCoverImageForDisplay(cover)).toBeNull();
  });

  it('resolves again if the file comes back (restore or re-add), without the reference being rewritten', () => {
    const vault = makeVault(vaultRoot, [photo]);
    const application = new Application(
      vault,
      new InMemoryVaultFileSystem(),
      new SelfWriteRegistry(),
      loadable
    );
    setRootPath(application, vaultRoot);

    vault.removeResource(photo.id);
    expect(application.resolveCoverImageForDisplay('Assets/photo.png')).toBeNull();

    vault.addResource(makeImageResource('r2', '/vault/Assets/photo.png'));
    expect(application.resolveCoverImageForDisplay('Assets/photo.png')).toBe(
      'loadable:/vault/Assets/photo.png'
    );
  });

  it.each(['Assets/photo.avif', 'Assets/photo.bmp', 'Assets/photo.HEIC'])(
    'keeps resolving %s, a file kind the Vault never indexes, so its absence from the index proves nothing',
    (cover) => {
      const application = createApplication(loadable);

      expect(application.resolveCoverImageForDisplay(cover)).toBe(`loadable:/vault/${cover}`);
    }
  );

  it.each(['./Assets/photo.png', 'Assets/../Assets/photo.png', 'Assets//photo.png'])(
    'keeps resolving the non-canonical reference %s through the loader, since the index is keyed by exact paths',
    (cover) => {
      const application = createApplication(loadable, [photo]);

      expect(application.resolveCoverImageForDisplay(cover)).toBe(`loadable:/vault/${cover}`);
    }
  );

  it('keeps resolving a .clutter file, which the Vault excludes from its index by design', () => {
    const application = createApplication(loadable);

    expect(application.resolveCoverImageForDisplay('.clutter/cover.png')).toBe(
      'loadable:/vault/.clutter/cover.png'
    );
  });

  it('judges the indexed kinds by extension without regard to case', () => {
    const application = createApplication(loadable);

    expect(application.resolveCoverImageForDisplay('Assets/PHOTO.PNG')).toBeNull();
  });

  it('does not treat an archived asset as the file the old reference names', () => {
    const archived = makeImageResource('r1', '/vault/Archive/photo.png');
    const application = createApplication(loadable, [archived]);

    expect(application.resolveCoverImageForDisplay('Assets/photo.png')).toBeNull();
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

describe('Application — Unsplash covers are hotlinked, never rehosted (ADR-054)', () => {
  const vaultRoot = '/vault';
  const unsplash = 'https://images.unsplash.com/photo-a?ixid=1&w=1080';

  function createApplication(): Application {
    const application = new Application(
      makeVault(vaultRoot),
      new InMemoryVaultFileSystem(),
      new SelfWriteRegistry(),
      { toLoadableUrl: (path) => path }
    );
    setRootPath(application, vaultRoot);
    return application;
  }

  it('resolveCoverImageForDisplay returns an Unsplash cover URL byte-for-byte (query parameters and ixid intact)', () => {
    expect(createApplication().resolveCoverImageForDisplay(unsplash)).toBe(unsplash);
  });

  it('findCoverCredit finds nothing in an empty vault and never calls the network', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(createApplication().findCoverCredit(unsplash)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
