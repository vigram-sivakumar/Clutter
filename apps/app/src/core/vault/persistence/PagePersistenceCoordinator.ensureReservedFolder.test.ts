import { describe, expect, it } from 'vitest';
import { PagePersistenceCoordinator } from './PagePersistenceCoordinator';
import { MoveService } from './MoveService';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Folder } from '../../vault/models/Folder';

const ROOT = '/vault';

const defaultFolderMetadata: Folder['metadata'] = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  status: 'active',
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

function makeFolder(id: string, path: string, parentId: string | null = null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: defaultFolderMetadata,
  };
}

function setup(folders: Folder[] = []) {
  const vault = new Vault(
    ROOT,
    [],
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  const fileSystem = new InMemoryVaultFileSystem();
  const moveService = new MoveService(vault, fileSystem);
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService
  );

  return { vault, fileSystem, coordinator };
}

describe('PagePersistenceCoordinator ensure-reserved-folder kind', () => {
  it('recreates a missing reserved folder on disk and registers it in Vault', async () => {
    const { vault, fileSystem, coordinator } = setup();
    expect(vault.getReservedFolder('daily-notes')).toBeUndefined();

    const result = await coordinator.enqueue('daily-notes', {
      kind: 'ensure-reserved-folder',
      reservedFolderId: 'daily-notes',
    });

    expect(result.status).toBe('folder-created');
    expect(await fileSystem.exists(`${ROOT}/Daily Notes`)).toBe(true);
    const recreated = vault.getReservedFolder('daily-notes');
    expect(recreated).toBeDefined();
    expect(recreated!.path).toBe(`${ROOT}/Daily Notes`);
    expect(recreated!.parentId).toBeNull();
  });

  it('writes no .folder.md for the recreated reserved folder — distinct from an ordinary user folder', async () => {
    const { fileSystem, coordinator } = setup();

    await coordinator.enqueue('daily-notes', {
      kind: 'ensure-reserved-folder',
      reservedFolderId: 'daily-notes',
    });

    expect(await fileSystem.exists(`${ROOT}/Daily Notes/.folder.md`)).toBe(false);
  });

  it('is idempotent — returns the existing folder unchanged when already present, creates nothing new', async () => {
    const existing = makeFolder('folder-daily-notes', `${ROOT}/Daily Notes`);
    const { vault, coordinator } = setup([existing]);

    const result = await coordinator.enqueue('daily-notes', {
      kind: 'ensure-reserved-folder',
      reservedFolderId: 'daily-notes',
    });

    expect(result.status).toBe('folder-created');
    if (result.status === 'folder-created') {
      expect(result.folder.id).toBe('folder-daily-notes');
    }
    expect(
      Array.from(vault.folders()).filter((f) => f.path === `${ROOT}/Daily Notes`)
    ).toHaveLength(1);
  });

  it('serializes two concurrent recovery attempts into a single created folder', async () => {
    const { vault, coordinator } = setup();

    const [first, second] = await Promise.all([
      coordinator.enqueue('daily-notes', {
        kind: 'ensure-reserved-folder',
        reservedFolderId: 'daily-notes',
      }),
      coordinator.enqueue('daily-notes', {
        kind: 'ensure-reserved-folder',
        reservedFolderId: 'daily-notes',
      }),
    ]);

    expect(first.status).toBe('folder-created');
    expect(second.status).toBe('folder-created');
    if (first.status === 'folder-created' && second.status === 'folder-created') {
      expect(second.folder.id).toBe(first.folder.id);
    }
    expect(
      Array.from(vault.folders()).filter((f) => f.path === `${ROOT}/Daily Notes`)
    ).toHaveLength(1);
  });
});
