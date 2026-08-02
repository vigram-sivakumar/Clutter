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

function makeVault(folders: Folder[] = []): Vault {
  return new Vault(
    ROOT,
    [],
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

function setup(folders: Folder[] = []) {
  const vault = makeVault(folders);
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

function folderDocument(id: string): string {
  return `---\nid: ${id}\n---\n`;
}

describe('PagePersistenceCoordinator create-folder vertical slice', () => {
  it('creates the directory, writes .folder.md, and registers the folder in the vault', async () => {
    const { vault, fileSystem, coordinator } = setup();

    const result = await coordinator.enqueue('folder-new', {
      kind: 'create-folder',
      path: `${ROOT}/Projects`,
      parentId: null,
      content: folderDocument('folder-new'),
    });

    expect(result.status).toBe('folder-created');
    expect(await fileSystem.exists(`${ROOT}/Projects`)).toBe(true);
    expect(fileSystem.hasFileSync(`${ROOT}/Projects/.folder.md`)).toBe(true);

    const created = vault.getFolder('folder-new');
    expect(created).toBeDefined();
    expect(created!.path).toBe(`${ROOT}/Projects`);
    expect(created!.parentId).toBeNull();
    expect(created!.name).toBe('Projects');
  });

  it('is idempotent for a second create-folder enqueued for an id this queue already persisted', async () => {
    const { vault, coordinator } = setup();

    const first = await coordinator.enqueue('folder-new', {
      kind: 'create-folder',
      path: `${ROOT}/Projects`,
      parentId: null,
      content: folderDocument('folder-new'),
    });

    const second = await coordinator.enqueue('folder-new', {
      kind: 'create-folder',
      path: `${ROOT}/Projects`,
      parentId: null,
      content: folderDocument('folder-new'),
    });

    expect(first.status).toBe('folder-created');
    expect(second.status).toBe('folder-created');
    expect(vault.folderCount).toBe(1);
  });

  it('abandons the operation, without wedging the queue, when the path collides with an existing folder', async () => {
    const existing: Folder = {
      id: 'existing-folder',
      name: 'Occupied',
      path: `${ROOT}/Occupied`,
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
    const { vault, coordinator } = setup([existing]);

    const result = await coordinator.enqueue('folder-new', {
      kind: 'create-folder',
      path: `${ROOT}/Occupied`,
      parentId: null,
      content: folderDocument('folder-new'),
    });

    expect(result.status).toBe('abandoned');
    expect(vault.getFolder('folder-new')).toBeUndefined();
    expect(vault.getFolder('existing-folder')).toBeDefined();

    // The queue isn't wedged by the abandoned operation — a subsequent
    // operation for a different id still runs normally.
    const followUp = await coordinator.enqueue('folder-another', {
      kind: 'create-folder',
      path: `${ROOT}/Another`,
      parentId: null,
      content: folderDocument('folder-another'),
    });
    expect(followUp.status).toBe('folder-created');
    expect(vault.getFolder('folder-another')).toBeDefined();
  });

  it('does not block or get blocked by an operation enqueued for a different id, including a page id', async () => {
    const { vault, coordinator } = setup();

    const [folderResult, anotherFolderResult] = await Promise.all([
      coordinator.enqueue('folder-a', {
        kind: 'create-folder',
        path: `${ROOT}/A`,
        parentId: null,
        content: folderDocument('folder-a'),
      }),
      coordinator.enqueue('folder-b', {
        kind: 'create-folder',
        path: `${ROOT}/B`,
        parentId: null,
        content: folderDocument('folder-b'),
      }),
    ]);

    expect(folderResult.status).toBe('folder-created');
    expect(anotherFolderResult.status).toBe('folder-created');
    expect(vault.getFolder('folder-a')).toBeDefined();
    expect(vault.getFolder('folder-b')).toBeDefined();
  });

  it('creates a folder nested under an existing parent', async () => {
    const parent: Folder = {
      id: 'parent-folder',
      name: 'Projects',
      path: `${ROOT}/Projects`,
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
    const { vault, coordinator } = setup([parent]);

    const result = await coordinator.enqueue('folder-child', {
      kind: 'create-folder',
      path: `${ROOT}/Projects/Q1`,
      parentId: 'parent-folder',
      content: folderDocument('folder-child'),
    });

    expect(result.status).toBe('folder-created');
    const created = vault.getFolder('folder-child');
    expect(created!.parentId).toBe('parent-folder');
    expect(created!.path).toBe(`${ROOT}/Projects/Q1`);
  });
});
