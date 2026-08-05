import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FolderOperations,
  FOLDER_NAME_AUTOSAVE_CEILING_MS,
  FOLDER_NAME_AUTOSAVE_DEBOUNCE_MS,
} from './FolderOperations';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
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
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { AUTOSAVE_DEBOUNCE_MS } from '../../engine/SaveCoordinator';
import type { Folder } from '../../vault/models/Folder';
import type { IdGenerator } from '../../shared/identity/IdGenerator';

const ROOT = '/vault';

function makeFolder(id: string, path: string, parentId: string | null = null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
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

function makeIdGenerator(): IdGenerator {
  return { generate: () => 'folder-new' };
}

function setup(folders: Folder[] = []) {
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
  const documentRegistry = new DocumentRegistry();
  const saveCoordinator = new SaveCoordinator();
  const folderOperations = new FolderOperations(
    vault,
    workspace,
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(makeIdGenerator()),
    () => {},
    documentRegistry,
    saveCoordinator,
    () => {}
  );

  return { vault, workspace, fileSystem, folderOperations };
}

describe('FolderOperations name channel (continuous commit + debounced autosave)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('commitName() arms a debounce timer that autosaves via requestNameSave() once it fires', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, fileSystem, folderOperations } = setup([folder]);
    await fileSystem.createDirectory(folder.path);
    const moveSpy = vi.spyOn(fileSystem, 'moveFile');

    folderOperations.commitName('folder-1', 'Renamed');
    expect(moveSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(FOLDER_NAME_AUTOSAVE_DEBOUNCE_MS);

    expect(moveSpy).toHaveBeenCalledTimes(1);
    expect(vault.getFolder('folder-1')!.path).toBe(`${ROOT}/Renamed`);
    expect(vault.getFolder('folder-1')!.name).toBe('Renamed');
  });

  it('uses its own, longer debounce than the body channel', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { fileSystem, folderOperations } = setup([folder]);
    await fileSystem.createDirectory(folder.path);
    const moveSpy = vi.spyOn(fileSystem, 'moveFile');

    folderOperations.commitName('folder-1', 'Renamed');

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    expect(moveSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(FOLDER_NAME_AUTOSAVE_DEBOUNCE_MS - AUTOSAVE_DEBOUNCE_MS);
    expect(moveSpy).toHaveBeenCalledTimes(1);
  });

  it('requestNameSave() flushes immediately regardless of the debounce window (blur behavior)', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, fileSystem, folderOperations } = setup([folder]);
    await fileSystem.createDirectory(folder.path);

    folderOperations.commitName('folder-1', 'Renamed');
    await folderOperations.requestNameSave('folder-1');

    expect(vault.getFolder('folder-1')!.name).toBe('Renamed');
  });

  it('requestNameSave() is a silent no-op for a folder with no name-editing activity', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { folderOperations } = setup([folder]);

    await expect(folderOperations.requestNameSave('folder-1')).resolves.toBeUndefined();
  });

  it('delete() cancels any armed name timer — no autosave fires for a deleted folder', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { fileSystem, folderOperations } = setup([folder]);
    await fileSystem.createDirectory(folder.path);
    const moveSpy = vi.spyOn(fileSystem, 'moveFile');

    folderOperations.commitName('folder-1', 'Never persisted');
    await folderOperations.delete('folder-1');
    moveSpy.mockClear();

    await vi.advanceTimersByTimeAsync(FOLDER_NAME_AUTOSAVE_DEBOUNCE_MS + FOLDER_NAME_AUTOSAVE_CEILING_MS);

    expect(moveSpy).not.toHaveBeenCalled();
  });

  it('flushActiveFolder() flushes the dirty name channel for the workspace-active folder', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, fileSystem, workspace, folderOperations } = setup([folder]);
    await fileSystem.createDirectory(folder.path);
    workspace.openFolder('folder-1');

    folderOperations.commitName('folder-1', 'Renamed');
    folderOperations.flushActiveFolder();
    await folderOperations.requestNameSave('folder-1');

    expect(vault.getFolder('folder-1')!.name).toBe('Renamed');
  });

  it('flushAll() flushes a dirty name channel (shutdown boundary)', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, fileSystem, folderOperations } = setup([folder]);
    await fileSystem.createDirectory(folder.path);

    folderOperations.commitName('folder-1', 'Renamed');

    await folderOperations.flushAll(5000);

    expect(vault.getFolder('folder-1')!.name).toBe('Renamed');
  });

  it('commitName() throws for an unknown folder id', () => {
    const { folderOperations } = setup([]);

    expect(() => folderOperations.commitName('does-not-exist', 'Anything')).toThrow(
      /Folder not found/
    );
  });
});

describe('FolderOperations.cancelNameEdit() (Escape support)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reverts a pending, not-yet-persisted name edit — no rename occurs, even after the debounce window elapses', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, fileSystem, folderOperations } = setup([folder]);
    await fileSystem.createDirectory(folder.path);
    const moveSpy = vi.spyOn(fileSystem, 'moveFile');

    folderOperations.commitName('folder-1', 'Cancelled Name');
    folderOperations.cancelNameEdit('folder-1');

    await vi.advanceTimersByTimeAsync(
      FOLDER_NAME_AUTOSAVE_DEBOUNCE_MS + FOLDER_NAME_AUTOSAVE_CEILING_MS
    );

    expect(moveSpy).not.toHaveBeenCalled();
    expect(vault.getFolder('folder-1')!.name).toBe('Projects');
  });

  it('is a silent no-op for a folder with no name-editing activity', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { folderOperations } = setup([folder]);

    expect(() => folderOperations.cancelNameEdit('folder-1')).not.toThrow();
  });
});
