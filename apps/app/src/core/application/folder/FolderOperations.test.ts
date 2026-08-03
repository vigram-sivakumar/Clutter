import { describe, expect, it, vi } from 'vitest';
import { FolderOperations } from './FolderOperations';
import { FolderPathResolver } from './FolderPathResolver';
import { FolderCreator } from './FolderCreator';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { Workspace } from '../../workspace/Workspace';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { MoveService } from '../../vault/persistence/MoveService';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Folder } from '../../vault/models/Folder';
import type { IdGenerator } from '../../shared/identity/IdGenerator';

const ROOT = '/vault';

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

function makeSequentialIdGenerator(ids: string[]): IdGenerator {
  let index = 0;
  return {
    generate: () => ids[index++] ?? `id-${index}`,
  };
}

function setup(
  folders: Folder[] = [],
  ids: string[] = ['folder-new'],
  prepareNavigation: () => void = () => {}
) {
  const vault = makeVault(folders);
  const workspace = new Workspace();
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
  const folderOperations = new FolderOperations(
    vault,
    workspace,
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(makeSequentialIdGenerator(ids)),
    prepareNavigation
  );

  return { vault, workspace, fileSystem, folderOperations };
}

describe('FolderOperations.open()', () => {
  it('opens the folder in the workspace', async () => {
    const { folderOperations, workspace } = setup([
      makeFolder('folder-1', `${ROOT}/Projects`),
    ]);

    await folderOperations.open('folder-1');

    expect(workspace.activeFolderId).toBe('folder-1');
  });

  it('throws for an unknown folder id', async () => {
    const { folderOperations } = setup();

    await expect(folderOperations.open('does-not-exist')).rejects.toThrow(
      /Folder not found/
    );
  });

  it('calls prepareNavigation before switching the workspace to the new folder', async () => {
    const prepareNavigation = vi.fn();
    const { folderOperations, workspace } = setup(
      [makeFolder('folder-1', `${ROOT}/Projects`)],
      undefined,
      prepareNavigation
    );

    await folderOperations.open('folder-1');

    expect(prepareNavigation).toHaveBeenCalledTimes(1);
    expect(prepareNavigation).toHaveBeenCalledWith();
    expect(workspace.activeFolderId).toBe('folder-1');
  });

  it('does not call prepareNavigation for a failed open (unknown folder id) — no navigation actually happens', async () => {
    const prepareNavigation = vi.fn();
    const { folderOperations } = setup([], undefined, prepareNavigation);

    await expect(folderOperations.open('does-not-exist')).rejects.toThrow();

    expect(prepareNavigation).not.toHaveBeenCalled();
  });

  it('is page-agnostic — FolderOperations never inspects what prepareNavigation does, only that it gets called', async () => {
    // The hook here does something FolderOperations has no concept of
    // (touching a page-shaped id) — proving this facade doesn't know or
    // care what the callback represents, only that it's invoked before
    // the workspace switch (autosave-ownership.md's page-agnostic
    // navigation hook design).
    const calls: string[] = [];
    const prepareNavigation = () => calls.push('flushed-something-page-shaped');
    const { folderOperations } = setup(
      [makeFolder('folder-1', `${ROOT}/Projects`)],
      undefined,
      prepareNavigation
    );

    await folderOperations.open('folder-1');

    expect(calls).toEqual(['flushed-something-page-shaped']);
  });
});

describe('FolderOperations.create()', () => {
  it('creates the folder at the vault root when parentId is null, and returns its persisted id', async () => {
    const { vault, fileSystem, folderOperations } = setup();

    const id = await folderOperations.create('Projects', null);

    expect(id).toBe('folder-new');
    expect(await fileSystem.exists(`${ROOT}/Projects`)).toBe(true);
    expect(fileSystem.hasFileSync(`${ROOT}/Projects/.folder.md`)).toBe(true);

    const created = vault.getFolder('folder-new');
    expect(created).toBeDefined();
    expect(created!.path).toBe(`${ROOT}/Projects`);
    expect(created!.parentId).toBeNull();
  });

  it('creates the folder nested under an existing parent', async () => {
    const parent = makeFolder('parent-folder', `${ROOT}/Projects`);
    const { vault, folderOperations } = setup([parent]);

    const id = await folderOperations.create('Q1', 'parent-folder');

    const created = vault.getFolder(id);
    expect(created!.parentId).toBe('parent-folder');
    expect(created!.path).toBe(`${ROOT}/Projects/Q1`);
  });

  it('is immediately visible in the vault after create() resolves', async () => {
    const { vault, folderOperations } = setup();

    await folderOperations.create('Projects', null);

    expect(vault.folderCount).toBe(1);
    expect(vault.getFolderByPath(`${ROOT}/Projects`)).toBeDefined();
  });

  it('picks a collision-free name when one already exists', async () => {
    const existing = makeFolder('folder-existing', `${ROOT}/Projects`);
    const { vault, folderOperations } = setup([existing]);

    const id = await folderOperations.create('Projects', null);

    const created = vault.getFolder(id);
    expect(created!.path).toBe(`${ROOT}/Projects 2`);
  });

  it('throws for an unknown parentId, without writing anything', async () => {
    const { fileSystem, folderOperations } = setup();

    await expect(
      folderOperations.create('Q1', 'does-not-exist')
    ).rejects.toThrow(/Folder not found: does-not-exist/);

    expect(await fileSystem.exists(`${ROOT}/Q1`)).toBe(false);
  });
});
