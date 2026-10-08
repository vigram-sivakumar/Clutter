import { describe, expect, it, vi } from 'vitest';
import { ResourceOperations } from './ResourceOperations';
import { PagePersistenceCoordinator, RestoreNeedsDestinationError } from '../../vault/persistence/PagePersistenceCoordinator';
import { MoveService } from '../../vault/persistence/MoveService';
import { ResourceArchiveMetadataStore } from '../../vault/persistence/ResourceArchiveMetadataStore';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Folder } from '../../vault/models/Folder';
import type { VaultResource } from '../../vault/models/VaultResource';

const ROOT = '/vault';
const ARCHIVE_FOLDER_ID = 'folder-archive';

function makeFolder(id: string, path: string): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId: null,
    metadata: {
      icon: null,
      favorite: false,
      description: '',
      cover: null,
      coverHidden: false,
      coverLayout: 'side' as const,
      coverPositionAbove: 50,
      coverPositionSide: 50,
      status: 'active',
      archivedAt: null,
      originalPath: null,
      originalParentId: null,
    },
  };
}

function makeResource(id: string, path: string, parentId: string | null = null): VaultResource {
  return {
    id,
    kind: 'image',
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
  };
}

function makeVault(folders: Folder[], resources: VaultResource[]): Vault {
  return new Vault(
    ROOT,
    [],
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    resources
  );
}

function setup(resources: VaultResource[] = [], folders: Folder[] = []) {
  const vault = makeVault(folders, resources);
  const fileSystem = new InMemoryVaultFileSystem();

  for (const resource of resources) {
    fileSystem.seedFile(resource.path, 'binary-content');
  }

  const moveService = new MoveService(vault, fileSystem);
  const resourceArchiveStore = new ResourceArchiveMetadataStore(fileSystem, ROOT);
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService,
    resourceArchiveStore
  );
  const resourceOperations = new ResourceOperations(coordinator);

  return { vault, fileSystem, resourceArchiveStore, coordinator, resourceOperations };
}

describe('ResourceOperations.renameResource', () => {
  it('delegates to the Gate with the rename-resource kind, passing the correct resource id and name', async () => {
    const resource = makeResource('resource-1', `${ROOT}/photo.png`);
    const { coordinator, resourceOperations } = setup([resource]);
    const enqueueSpy = vi.spyOn(coordinator, 'enqueue');

    await resourceOperations.renameResource('resource-1', 'holiday');

    expect(enqueueSpy).toHaveBeenCalledWith('resource-1', {
      kind: 'rename-resource',
      title: 'holiday',
    });
    enqueueSpy.mockRestore();
  });

  it('resolves successfully and the Vault reflects the rename', async () => {
    const resource = makeResource('resource-1', `${ROOT}/photo.png`);
    const { vault, resourceOperations } = setup([resource]);

    await expect(resourceOperations.renameResource('resource-1', 'holiday')).resolves.toBeUndefined();

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/holiday.png`);
  });

  it('preserves the extension and the existing auto-suffix collision behavior end-to-end', async () => {
    const resource = makeResource('resource-1', `${ROOT}/photo.png`);
    const occupant = makeResource('resource-2', `${ROOT}/holiday.png`);
    const { vault, resourceOperations } = setup([resource, occupant]);

    await resourceOperations.renameResource('resource-1', 'holiday');

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/holiday 2.png`);
  });

  it('throws "Resource not found" for a missing resource id, matching PageOperations\' abandoned-status error convention', async () => {
    const { resourceOperations } = setup([]);

    await expect(resourceOperations.renameResource('missing', 'holiday')).rejects.toThrow(
      'Resource not found: missing'
    );
  });
});

describe('ResourceOperations.archiveResource', () => {
  it('delegates to the Gate with the archive-resource kind and the correct resource id', async () => {
    const archiveFolder = makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`);
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const { coordinator, resourceOperations } = setup([resource], [archiveFolder]);
    const enqueueSpy = vi.spyOn(coordinator, 'enqueue');

    await resourceOperations.archiveResource('resource-1');

    expect(enqueueSpy).toHaveBeenCalledWith('resource-1', { kind: 'archive-resource' });
    enqueueSpy.mockRestore();
  });

  it('resolves successfully and the Vault reflects the archive', async () => {
    const archiveFolder = makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`);
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const { vault, resourceOperations } = setup([resource], [archiveFolder]);

    await expect(resourceOperations.archiveResource('resource-1')).resolves.toBeUndefined();

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Archive/hero.png`);
  });

  it('throws "Resource not found" for a missing resource id', async () => {
    const { resourceOperations } = setup([]);

    await expect(resourceOperations.archiveResource('missing')).rejects.toThrow(
      'Resource not found: missing'
    );
  });
});

describe('ResourceOperations.restoreResource', () => {
  it('delegates to the Gate with the restore-resource kind and the correct resource id', async () => {
    const archiveFolder = makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`);
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const assets = makeFolder('folder-assets', `${ROOT}/Assets`);
    const { coordinator, resourceOperations } = setup([resource], [archiveFolder, assets]);
    const enqueueSpy = vi.spyOn(coordinator, 'enqueue');

    await resourceOperations.restoreResource('resource-1', { destinationFolderId: 'folder-assets' });

    expect(enqueueSpy).toHaveBeenCalledWith('resource-1', { kind: 'restore-resource', destinationFolderId: 'folder-assets' });
    enqueueSpy.mockRestore();
  });

  it('with no provenance recorded (placed in Archive/ from outside) it asks for a destination and moves nothing', async () => {
    const archiveFolder = makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`);
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const { vault, resourceArchiveStore, resourceOperations } = setup([resource], [archiveFolder]);

    await expect(resourceOperations.restoreResource('resource-1')).rejects.toBeInstanceOf(RestoreNeedsDestinationError);

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Archive/hero.png`);
    expect((await resourceArchiveStore.read()).size).toBe(0);
  });

  it('with a chosen destination (the Assets root here) it restores there and fabricates no provenance', async () => {
    const archiveFolder = makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`);
    const assets = makeFolder('folder-assets', `${ROOT}/Assets`);
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const { vault, resourceArchiveStore, resourceOperations } = setup([resource], [archiveFolder, assets]);

    await expect(resourceOperations.restoreResource('resource-1', { destinationFolderId: 'folder-assets' })).resolves.toBeUndefined();

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Assets/hero.png`);
    expect((await resourceArchiveStore.read()).size).toBe(0);
  });

  it('throws "Resource not found" for a missing resource id', async () => {
    const { resourceOperations } = setup([]);

    await expect(resourceOperations.restoreResource('missing')).rejects.toThrow(
      'Resource not found: missing'
    );
  });
});

describe('ResourceOperations.deleteResource', () => {
  it('delegates to the Gate with the delete-resource kind and the correct resource id', async () => {
    const archiveFolder = makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`);
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const { coordinator, resourceOperations } = setup([resource], [archiveFolder]);
    const enqueueSpy = vi.spyOn(coordinator, 'enqueue');

    await resourceOperations.deleteResource('resource-1');

    expect(enqueueSpy).toHaveBeenCalledWith('resource-1', { kind: 'delete-resource' });
    enqueueSpy.mockRestore();
  });

  it('resolves successfully and the Vault no longer has the resource', async () => {
    const archiveFolder = makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`);
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const { vault, resourceOperations } = setup([resource], [archiveFolder]);

    await expect(resourceOperations.deleteResource('resource-1')).resolves.toBeUndefined();

    expect(vault.getResource('resource-1')).toBeUndefined();
  });

  it('throws "Resource not found" for a missing resource id', async () => {
    const { resourceOperations } = setup([]);

    await expect(resourceOperations.deleteResource('missing')).rejects.toThrow(
      'Resource not found: missing'
    );
  });
});

describe('ResourceOperations.moveResource', () => {
  it('delegates to the Gate with the move-resource kind, passing the correct resource id and destination', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Assets/Images`);
    const resource = makeResource('resource-1', `${ROOT}/Assets/hero.png`);
    const { coordinator, resourceOperations } = setup([resource], [folder]);
    const enqueueSpy = vi.spyOn(coordinator, 'enqueue');

    await resourceOperations.moveResource('resource-1', 'folder-1');

    expect(enqueueSpy).toHaveBeenCalledWith('resource-1', {
      kind: 'move-resource',
      destinationFolderId: 'folder-1',
    });
    enqueueSpy.mockRestore();
  });

  it('resolves successfully and the Vault reflects the move', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Assets/Images`);
    const resource = makeResource('resource-1', `${ROOT}/Assets/hero.png`);
    const { vault, resourceOperations } = setup([resource], [folder]);

    await expect(resourceOperations.moveResource('resource-1', 'folder-1')).resolves.toBeUndefined();

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Assets/Images/hero.png`);
  });

  it('rejects a destination outside Assets — the vault root or an ordinary folder (ADR-049)', async () => {
    const assets = makeFolder('folder-assets', `${ROOT}/Assets`);
    const normal = makeFolder('folder-2', `${ROOT}/Projects`);
    const resource = makeResource('resource-1', `${ROOT}/Assets/hero.png`, 'folder-assets');
    const { vault, resourceOperations } = setup([resource], [assets, normal]);

    await expect(resourceOperations.moveResource('resource-1', null)).rejects.toThrow(
      /can only be moved within assets/
    );
    await expect(resourceOperations.moveResource('resource-1', 'folder-2')).rejects.toThrow(
      /can only be moved within assets/
    );
    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Assets/hero.png`);
  });

  it('throws "Resource not found" for a missing resource id', async () => {
    const { resourceOperations } = setup([]);

    await expect(resourceOperations.moveResource('missing', null)).rejects.toThrow(
      'Resource not found: missing'
    );
  });
});

describe('ResourceOperations: responsibility boundaries', () => {
  it('performs no filesystem access of its own — every disk effect happens only once the mocked Gate call runs', async () => {
    const resource = makeResource('resource-1', `${ROOT}/photo.png`);
    const { coordinator, fileSystem, resourceOperations } = setup([resource]);
    const enqueueSpy = vi
      .spyOn(coordinator, 'enqueue')
      .mockResolvedValueOnce({ status: 'resource-renamed', resource: { ...resource, path: `${ROOT}/holiday.png` } });

    await resourceOperations.renameResource('resource-1', 'holiday');

    // The Gate call was intercepted before any real dispatch ran — the
    // source file is still exactly where it started, proving
    // ResourceOperations itself never calls fileSystem.moveFile (or
    // anything else on VaultFileSystem) directly.
    expect(await fileSystem.exists(`${ROOT}/photo.png`)).toBe(true);
    expect(await fileSystem.exists(`${ROOT}/holiday.png`)).toBe(false);
    enqueueSpy.mockRestore();
  });

  it('writes no archive-provenance record of its own — .clutter/resource-archive.json is untouched when the Gate call is intercepted', async () => {
    const archiveFolder = makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`);
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const { coordinator, fileSystem, resourceOperations } = setup([resource], [archiveFolder]);
    const enqueueSpy = vi.spyOn(coordinator, 'enqueue').mockResolvedValueOnce({
      status: 'resource-archived',
      resource: { ...resource, path: `${ROOT}/Archive/hero.png`, parentId: ARCHIVE_FOLDER_ID },
    });

    await resourceOperations.archiveResource('resource-1');

    expect(await fileSystem.exists(`${ROOT}/.clutter/resource-archive.json`)).toBe(false);
    enqueueSpy.mockRestore();
  });

  it('computes no destination of its own — the exact PersistenceOperation payload carries only id/kind/title, never a resolved path', async () => {
    const resource = makeResource('resource-1', `${ROOT}/photo.png`);
    const { coordinator, resourceOperations } = setup([resource]);
    const enqueueSpy = vi.spyOn(coordinator, 'enqueue');

    await resourceOperations.renameResource('resource-1', 'holiday');
    await resourceOperations.archiveResource('resource-1');

    for (const call of enqueueSpy.mock.calls) {
      const operation = call[1] as Record<string, unknown>;
      expect(operation).not.toHaveProperty('path');
      expect(operation).not.toHaveProperty('parentId');
      expect(operation).not.toHaveProperty('destination');
    }
    enqueueSpy.mockRestore();
  });

  it('holds no VaultFileSystem or ResourceArchiveMetadataStore dependency at all — constructible from just the Gate', () => {
    const { coordinator } = setup([]);

    expect(() => new ResourceOperations(coordinator)).not.toThrow();
  });
});

describe('ResourceOperations: archived assets (Phase 9)', () => {
  const archivedFolderMeta = (folder: Folder): Folder => ({
    ...folder,
    metadata: { ...folder.metadata, status: 'archived' },
  });

  it('an archived asset cannot be moved — enforced by the Gate, not by a picker', async () => {
    const archiveFolder = makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`);
    const assets = makeFolder('folder-assets', `${ROOT}/Assets`);
    const resource = makeResource('r1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const { vault, resourceOperations } = setup([resource], [archiveFolder, assets]);

    await expect(resourceOperations.moveResource('r1', 'folder-assets')).rejects.toThrow(/archived resource/);
    expect(vault.getResource('r1')!.path).toBe(`${ROOT}/Archive/hero.png`);
  });

  it('an asset inside an archived folder counts as archived too (its own location says Archive/)', async () => {
    const archiveFolder = makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`);
    const old = archivedFolderMeta({ ...makeFolder('folder-old', `${ROOT}/Archive/Old`), parentId: ARCHIVE_FOLDER_ID });
    const assets = makeFolder('folder-assets', `${ROOT}/Assets`);
    const resource = makeResource('r1', `${ROOT}/Archive/Old/hero.png`, 'folder-old');
    const { vault, resourceOperations } = setup([resource], [archiveFolder, old, assets]);

    expect(vault.isResourceEffectivelyArchived(resource)).toBe(true);
    await expect(resourceOperations.moveResource('r1', 'folder-assets')).rejects.toThrow(/archived resource/);
  });

  it('an asset whose folder merely says status: archived but sits outside Archive/ is active — location decides', () => {
    const old = archivedFolderMeta(makeFolder('folder-old', `${ROOT}/Assets/Old`));
    const resource = makeResource('r1', `${ROOT}/Assets/Old/hero.png`, 'folder-old');
    const { vault } = setup([resource], [old]);

    expect(vault.isResourceEffectivelyArchived(resource)).toBe(false);
  });

  it('an asset inside a folder under Archive/ is archived whatever its folder\'s status says', () => {
    const old = makeFolder('folder-old', `${ROOT}/Archive/Old`);
    const resource = makeResource('r1', `${ROOT}/Archive/Old/hero.png`, 'folder-old');
    const { vault } = setup([resource], [old]);

    expect(vault.isResourceEffectivelyArchived(resource)).toBe(true);
  });

  it('nothing can be moved into an archived folder, or one inside it', async () => {
    const assets = makeFolder('folder-assets', `${ROOT}/Assets`);
    const archivedAssets = { ...makeFolder('folder-old', `${ROOT}/Archive/Old`), parentId: ARCHIVE_FOLDER_ID };
    const nested = { ...makeFolder('folder-nested', `${ROOT}/Archive/Old/Nested`), parentId: 'folder-old' };
    const resource = makeResource('r1', `${ROOT}/Assets/hero.png`, 'folder-assets');
    const { vault, resourceOperations } = setup([resource], [assets, archivedAssets, nested]);

    await expect(resourceOperations.moveResource('r1', 'folder-old')).rejects.toThrow(/archived folder/);
    await expect(resourceOperations.moveResource('r1', 'folder-nested')).rejects.toThrow(/archived folder/);
    expect(vault.getResource('r1')!.path).toBe(`${ROOT}/Assets/hero.png`);
  });

  it('an active asset still moves into an active folder', async () => {
    const assets = makeFolder('folder-assets', `${ROOT}/Assets`);
    const images = { ...makeFolder('folder-images', `${ROOT}/Assets/Images`), parentId: 'folder-assets' };
    const resource = makeResource('r1', `${ROOT}/Assets/hero.png`, 'folder-assets');
    const { vault, resourceOperations } = setup([resource], [assets, images]);

    await resourceOperations.moveResource('r1', 'folder-images');

    expect(vault.getResource('r1')!.path).toBe(`${ROOT}/Assets/Images/hero.png`);
  });

  it('archive → restore returns the asset to the exact folder it came from', async () => {
    const archiveFolder = makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`);
    const assets = makeFolder('folder-assets', `${ROOT}/Assets`);
    const images = { ...makeFolder('folder-images', `${ROOT}/Assets/Images`), parentId: 'folder-assets' };
    const resource = makeResource('r1', `${ROOT}/Assets/Images/hero.png`, 'folder-images');
    const { vault, resourceOperations } = setup([resource], [archiveFolder, assets, images]);

    await resourceOperations.archiveResource('r1');
    expect(vault.isResourceEffectivelyArchived(vault.getResource('r1')!)).toBe(true);

    await resourceOperations.restoreResource('r1');

    expect(vault.getResource('r1')!.path).toBe(`${ROOT}/Assets/Images/hero.png`);
    expect(vault.getResource('r1')!.parentId).toBe('folder-images');
    expect(vault.isResourceEffectivelyArchived(vault.getResource('r1')!)).toBe(false);
  });

  it('a restored asset can be moved again, and an archived one drops out of the active Assets', async () => {
    const archiveFolder = makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`);
    const assets = makeFolder('folder-assets', `${ROOT}/Assets`);
    const images = { ...makeFolder('folder-images', `${ROOT}/Assets/Images`), parentId: 'folder-assets' };
    const resource = makeResource('r1', `${ROOT}/Assets/hero.png`, 'folder-assets');
    const { vault, resourceOperations } = setup([resource], [archiveFolder, assets, images]);

    await resourceOperations.archiveResource('r1');
    await resourceOperations.restoreResource('r1');
    await resourceOperations.moveResource('r1', 'folder-images');

    expect(vault.getResource('r1')!.path).toBe(`${ROOT}/Assets/Images/hero.png`);
  });

  it('delete removes the file, its archive record and the vault entry', async () => {
    const archiveFolder = makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`);
    const assets = makeFolder('folder-assets', `${ROOT}/Assets`);
    const resource = makeResource('r1', `${ROOT}/Assets/hero.png`, 'folder-assets');
    const { vault, fileSystem, resourceArchiveStore, resourceOperations } = setup([resource], [archiveFolder, assets]);

    await resourceOperations.archiveResource('r1');
    const archivedPath = vault.getResource('r1')!.path;
    expect((await resourceArchiveStore.read()).has(archivedPath)).toBe(true);

    await resourceOperations.deleteResource('r1');

    expect(vault.getResource('r1')).toBeUndefined();
    expect(await fileSystem.exists(archivedPath)).toBe(false);
    expect((await resourceArchiveStore.read()).has(archivedPath)).toBe(false);
  });
});

describe('ResourceOperations: archive integrity at the domain (Phase 10)', () => {
  const archiveFolder = () => makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`);
  const assets = () => makeFolder('folder-assets', `${ROOT}/Assets`);

  it('an active asset cannot be permanently deleted, and keeps its file', async () => {
    const resource = makeResource('r1', `${ROOT}/Assets/hero.png`, 'folder-assets');
    const { vault, fileSystem, resourceOperations } = setup([resource], [archiveFolder(), assets()]);

    await expect(resourceOperations.deleteResource('r1')).rejects.toThrow(/not archived/);

    expect(vault.getResource('r1')).toBeDefined();
    expect(await fileSystem.exists(resource.path)).toBe(true);
  });

  it('an active asset cannot be "restored"', async () => {
    const resource = makeResource('r1', `${ROOT}/Assets/hero.png`, 'folder-assets');
    const { vault, resourceOperations } = setup([resource], [archiveFolder(), assets()]);

    await expect(resourceOperations.restoreResource('r1')).rejects.toThrow(/not archived/);

    expect(vault.getResource('r1')!.path).toBe(`${ROOT}/Assets/hero.png`);
  });

  it('an archived asset cannot be archived again', async () => {
    const resource = makeResource('r1', `${ROOT}/Assets/hero.png`, 'folder-assets');
    const { vault, resourceOperations } = setup([resource], [archiveFolder(), assets()]);
    await resourceOperations.archiveResource('r1');
    const archivedPath = vault.getResource('r1')!.path;

    await expect(resourceOperations.archiveResource('r1')).rejects.toThrow(/already archived/);

    expect(vault.getResource('r1')!.path).toBe(archivedPath);
  });

  it('archive → delete works end to end; archive → restore still returns it', async () => {
    const resource = makeResource('r1', `${ROOT}/Assets/hero.png`, 'folder-assets');
    const { vault, resourceOperations } = setup([resource], [archiveFolder(), assets()]);

    await resourceOperations.archiveResource('r1');
    await resourceOperations.restoreResource('r1');
    expect(vault.getResource('r1')!.path).toBe(`${ROOT}/Assets/hero.png`);

    await resourceOperations.archiveResource('r1');
    await resourceOperations.deleteResource('r1');
    expect(vault.getResource('r1')).toBeUndefined();
  });

  it('intentional behaviour is unchanged: an archived asset can still be renamed in place', async () => {
    const resource = makeResource('r1', `${ROOT}/Assets/hero.png`, 'folder-assets');
    const { vault, resourceOperations } = setup([resource], [archiveFolder(), assets()]);
    await resourceOperations.archiveResource('r1');

    await expect(resourceOperations.renameResource('r1', 'renamed')).resolves.toBeUndefined();

    expect(vault.getResource('r1')!.name).toContain('renamed');
  });
});
