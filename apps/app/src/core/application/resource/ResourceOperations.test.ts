import { describe, expect, it, vi } from 'vitest';
import { ResourceOperations } from './ResourceOperations';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { MoveService } from '../../vault/persistence/MoveService';
import { ResourceArchiveMetadataStore } from '../../vault/persistence/ResourceArchiveMetadataStore';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { Workspace } from '../../workspace/Workspace';
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
  const workspace = new Workspace();
  const resourceOperations = new ResourceOperations(vault, workspace, coordinator);

  return { vault, fileSystem, resourceArchiveStore, coordinator, workspace, resourceOperations };
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
    const { coordinator, resourceOperations } = setup([resource], [archiveFolder]);
    const enqueueSpy = vi.spyOn(coordinator, 'enqueue');

    await resourceOperations.restoreResource('resource-1');

    expect(enqueueSpy).toHaveBeenCalledWith('resource-1', { kind: 'restore-resource' });
    enqueueSpy.mockRestore();
  });

  it('resolves successfully and the Vault reflects the restore (falls back to Assets/ with no provenance recorded)', async () => {
    const archiveFolder = makeFolder(ARCHIVE_FOLDER_ID, `${ROOT}/Archive`);
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`, ARCHIVE_FOLDER_ID);
    const { vault, resourceOperations } = setup([resource], [archiveFolder]);

    await expect(resourceOperations.restoreResource('resource-1')).resolves.toBeUndefined();

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Assets/hero.png`);
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
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`);
    const { coordinator, resourceOperations } = setup([resource]);
    const enqueueSpy = vi.spyOn(coordinator, 'enqueue');

    await resourceOperations.deleteResource('resource-1');

    expect(enqueueSpy).toHaveBeenCalledWith('resource-1', { kind: 'delete-resource' });
    enqueueSpy.mockRestore();
  });

  it('resolves successfully and the Vault no longer has the resource', async () => {
    const resource = makeResource('resource-1', `${ROOT}/Archive/hero.png`);
    const { vault, resourceOperations } = setup([resource]);

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
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
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
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const resource = makeResource('resource-1', `${ROOT}/hero.png`);
    const { vault, resourceOperations } = setup([resource], [folder]);

    await expect(resourceOperations.moveResource('resource-1', 'folder-1')).resolves.toBeUndefined();

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/Projects/hero.png`);
  });

  it('supports a null destination (vault root)', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const resource = makeResource('resource-1', `${ROOT}/Projects/hero.png`, 'folder-1');
    const { vault, resourceOperations } = setup([resource], [folder]);

    await resourceOperations.moveResource('resource-1', null);

    expect(vault.getResource('resource-1')!.path).toBe(`${ROOT}/hero.png`);
    expect(vault.getResource('resource-1')!.parentId).toBeNull();
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

  it('holds no VaultFileSystem or ResourceArchiveMetadataStore dependency at all — constructible from just the Vault, Workspace, and the Gate', () => {
    const { vault, workspace, coordinator } = setup([]);

    expect(() => new ResourceOperations(vault, workspace, coordinator)).not.toThrow();
  });
});

describe('ResourceOperations.open', () => {
  it('opens the resource in the workspace when it exists', () => {
    const resource = makeResource('resource-1', `${ROOT}/photo.png`);
    const { workspace, resourceOperations } = setup([resource]);

    resourceOperations.open('resource-1');

    expect(workspace.activeView).toEqual({ type: 'resource', id: 'resource-1' });
    expect(workspace.activeResourceId).toBe('resource-1');
  });

  it('throws "Resource not found" for a missing resource id and does not touch the workspace', () => {
    const { workspace, resourceOperations } = setup([]);

    expect(() => resourceOperations.open('missing')).toThrow('Resource not found: missing');
    expect(workspace.activeView).toBeNull();
  });

  it('forwards recordHistory through to Workspace.openResource', () => {
    const resource = makeResource('resource-1', `${ROOT}/photo.png`);
    const { workspace, resourceOperations } = setup([resource]);
    const openResourceSpy = vi.spyOn(workspace, 'openResource');

    resourceOperations.open('resource-1', { recordHistory: false });

    expect(openResourceSpy).toHaveBeenCalledWith('resource-1', { recordHistory: false });
    openResourceSpy.mockRestore();
  });
});
