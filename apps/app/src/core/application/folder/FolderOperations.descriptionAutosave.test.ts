import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FolderOperations } from './FolderOperations';
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
      description: null,
      cover: null,
      coverHidden: false,
      coverLayout: 'side' as const,
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

describe('FolderOperations description channel (continuous commit + debounced autosave)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('commitDescription() arms a debounce timer that autosaves via requestDescriptionSave() once it fires', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, fileSystem, folderOperations } = setup([folder]);
    await fileSystem.createDirectory(folder.path);
    const writeSpy = vi.spyOn(fileSystem, 'writeFile');

    folderOperations.commitDescription('folder-1', 'Project files');
    expect(writeSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(vault.getFolder('folder-1')!.metadata.description).toBe('Project files');
  });

  it('uses the body channel\'s default cadence, not the name channel\'s longer one', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { fileSystem, folderOperations } = setup([folder]);
    await fileSystem.createDirectory(folder.path);
    const writeSpy = vi.spyOn(fileSystem, 'writeFile');

    folderOperations.commitDescription('folder-1', 'Project files');

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 1);
    expect(writeSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it('requestDescriptionSave() flushes immediately regardless of the debounce window (blur behavior)', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, fileSystem, folderOperations } = setup([folder]);
    await fileSystem.createDirectory(folder.path);

    folderOperations.commitDescription('folder-1', 'Project files');
    await folderOperations.requestDescriptionSave('folder-1');

    expect(vault.getFolder('folder-1')!.metadata.description).toBe('Project files');
  });

  it('requestDescriptionSave() is a silent no-op for a folder with no description-editing activity', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { folderOperations } = setup([folder]);

    await expect(
      folderOperations.requestDescriptionSave('folder-1')
    ).resolves.toBeUndefined();
  });

  it('clearing a description to empty persists null, not a literal empty string (omit-on-empty convention)', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, fileSystem, folderOperations } = setup([folder]);
    await fileSystem.createDirectory(folder.path);

    folderOperations.commitDescription('folder-1', 'Project files');
    await folderOperations.requestDescriptionSave('folder-1');
    expect(vault.getFolder('folder-1')!.metadata.description).toBe('Project files');

    folderOperations.commitDescription('folder-1', '');
    await folderOperations.requestDescriptionSave('folder-1');

    expect(vault.getFolder('folder-1')!.metadata.description).toBeNull();
  });

  it('delete() cancels any armed description timer — no autosave fires for a deleted folder', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { fileSystem, folderOperations } = setup([folder]);
    await fileSystem.createDirectory(folder.path);

    folderOperations.commitDescription('folder-1', 'Never persisted');
    await folderOperations.delete('folder-1');
    const writeSpy = vi.spyOn(fileSystem, 'writeFile');

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 30000);

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('commitDescription() throws for a folder id with no backing Vault folder', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { folderOperations } = setup([folder]);

    expect(() =>
      folderOperations.commitDescription('does-not-exist', 'Anything')
    ).toThrow(/Folder not found/);
  });
});

describe('FolderOperations.cancelDescriptionEdit() (Escape support)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reverts a pending, not-yet-persisted description edit — no write occurs, even after the debounce window elapses', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, fileSystem, folderOperations } = setup([folder]);
    await fileSystem.createDirectory(folder.path);
    const writeSpy = vi.spyOn(fileSystem, 'writeFile');

    folderOperations.commitDescription('folder-1', 'Cancelled description');
    folderOperations.cancelDescriptionEdit('folder-1');

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 30000);

    expect(writeSpy).not.toHaveBeenCalled();
    expect(vault.getFolder('folder-1')!.metadata.description).toBe(
      folder.metadata.description
    );
  });

  it('is a silent no-op for a folder with no description-editing activity', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { folderOperations } = setup([folder]);

    expect(() => folderOperations.cancelDescriptionEdit('folder-1')).not.toThrow();
  });
});
