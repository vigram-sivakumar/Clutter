import { describe, expect, it, vi } from 'vitest';
import { DailyNoteService } from './DailyNoteService';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { Workspace } from '../../workspace/Workspace';
import { FolderOperations } from '../folder/FolderOperations';
import { FolderPathResolver } from '../folder/FolderPathResolver';
import { FolderCreator } from '../folder/FolderCreator';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { MoveService } from '../../vault/persistence/MoveService';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import type { Folder } from '../../vault/models/Folder';
import type { IdGenerator } from '../../shared/identity/IdGenerator';

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

function makeFolder(id: string, path: string, parentId: string | null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: defaultFolderMetadata,
  };
}

function makeSequentialIdGenerator(ids: string[]): IdGenerator {
  let index = 0;
  return { generate: () => ids[index++] ?? `id-${index}` };
}

function setup(folders: Folder[] = [], ids: string[] = []) {
  const dailyNotesRoot = makeFolder('daily-notes-root', `${ROOT}/Daily Notes`, null);
  const vault = new Vault(
    ROOT,
    [],
    [dailyNotesRoot, ...folders],
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
  const folderOperations = new FolderOperations(
    vault,
    new Workspace(),
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(makeSequentialIdGenerator(ids))
  );

  return { vault, folderOperations };
}

describe('DailyNoteService.ensureFolderChain', () => {
  it('creates both the year and month folder when neither exists', async () => {
    const { vault, folderOperations } = setup([], ['year-2026', 'month-august']);
    const service = new DailyNoteService();

    const monthFolderId = await service.ensureFolderChain(
      vault,
      folderOperations,
      `${ROOT}/Daily Notes/2026/August/2026-08-15.md`
    );

    expect(monthFolderId).toBe('month-august');
    const year = vault.getFolderByPath(`${ROOT}/Daily Notes/2026`);
    const month = vault.getFolder('month-august');
    expect(year).toBeDefined();
    expect(month).toBeDefined();
    expect(month!.parentId).toBe(year!.id);
    expect(year!.parentId).toBe('daily-notes-root');
  });

  it('creates only the month folder when the year already exists', async () => {
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'daily-notes-root');
    const { vault, folderOperations } = setup([year], ['month-august']);
    const createSpy = vi.spyOn(folderOperations, 'create');
    const service = new DailyNoteService();

    const monthFolderId = await service.ensureFolderChain(
      vault,
      folderOperations,
      `${ROOT}/Daily Notes/2026/August/2026-08-15.md`
    );

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith('August', 'year-2026');
    const month = vault.getFolder(monthFolderId);
    expect(month!.parentId).toBe('year-2026');
  });

  it('creates nothing when both the year and month already exist', async () => {
    const year = makeFolder('year-2026', `${ROOT}/Daily Notes/2026`, 'daily-notes-root');
    const month = makeFolder('month-august', `${ROOT}/Daily Notes/2026/August`, 'year-2026');
    const { vault, folderOperations } = setup([year, month]);
    const createSpy = vi.spyOn(folderOperations, 'create');
    const service = new DailyNoteService();

    const monthFolderId = await service.ensureFolderChain(
      vault,
      folderOperations,
      `${ROOT}/Daily Notes/2026/August/2026-08-15.md`
    );

    expect(createSpy).not.toHaveBeenCalled();
    expect(monthFolderId).toBe('month-august');
  });

  it('throws for a malformed daily note path', async () => {
    const { vault, folderOperations } = setup();
    const service = new DailyNoteService();

    await expect(
      service.ensureFolderChain(vault, folderOperations, `${ROOT}/Daily Notes/2026.md`)
    ).rejects.toThrow(/Malformed Daily Note path/);
  });
});

// DailyNoteService.ensurePage() was retired by ADR-017: creating today's
// note through the Gate is no longer this service's job (it owns
// path/directory conventions only). The equivalent behavior — resolving a
// deterministic path to either the real Vault page or an unpersisted
// draft, and persisting that draft correctly on first save — is now
// PageOperations.openAtPath()'s responsibility, covered in
// PageOperations.test.ts's "drafts (ADR-017)" describe block.
