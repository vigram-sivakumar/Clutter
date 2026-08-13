import { describe, expect, it, vi } from 'vitest';
import { DailyNoteService } from './DailyNoteService';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { Workspace } from '../../workspace/Workspace';
import { FolderOperations } from '../folder/FolderOperations';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from '../folder/FolderCreator';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { MoveService } from '../../vault/persistence/MoveService';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
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

function setup(
  folders: Folder[] = [],
  ids: string[] = [],
  options: { includeDailyNotesRoot?: boolean } = {}
) {
  const { includeDailyNotesRoot = true } = options;
  const dailyNotesRoot = makeFolder(
    'daily-notes-root',
    `${ROOT}/Daily Notes`,
    null
  );
  const vault = new Vault(
    ROOT,
    [],
    includeDailyNotesRoot ? [dailyNotesRoot, ...folders] : folders,
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
    new FolderCreator(makeSequentialIdGenerator(ids)),
    () => {},
    new DocumentRegistry(),
    new SaveCoordinator(),
    () => {}
  );

  return { vault, folderOperations, fileSystem };
}

describe('DailyNoteService.ensureFolderChain', () => {
  it('creates both the year and month folder when neither exists', async () => {
    const { vault, folderOperations } = setup(
      [],
      ['year-2026', 'month-august']
    );
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
    const year = makeFolder(
      'year-2026',
      `${ROOT}/Daily Notes/2026`,
      'daily-notes-root'
    );
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
    const year = makeFolder(
      'year-2026',
      `${ROOT}/Daily Notes/2026`,
      'daily-notes-root'
    );
    const month = makeFolder(
      'month-august',
      `${ROOT}/Daily Notes/2026/August`,
      'year-2026'
    );
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
      service.ensureFolderChain(
        vault,
        folderOperations,
        `${ROOT}/Daily Notes/2026.md`
      )
    ).rejects.toThrow(/Malformed Daily Note path/);
  });
});

// Recovery for the reserved Daily Notes root itself, missing from Vault —
// e.g. deleted externally while the app kept running and reconciled away
// by VaultSyncService.handleDeleted, or simply never materialized yet
// (lazy system-folder lifecycle — nothing creates it eagerly at startup
// anymore). ensureFolderChain recovers it the same check-then-create way
// it already recovers a missing year/month level.
describe('DailyNoteService.ensureFolderChain — recovering a missing Daily Notes root', () => {
  it('never throws when the reserved Daily Notes folder is missing from Vault — recreates it instead', async () => {
    const { vault, folderOperations } = setup([], ['daily-notes-recovered', 'year-2026', 'month-august'], {
      includeDailyNotesRoot: false,
    });
    expect(vault.getReservedFolder('daily-notes')).toBeUndefined();
    const service = new DailyNoteService();

    const monthFolderId = await service.ensureFolderChain(
      vault,
      folderOperations,
      `${ROOT}/Daily Notes/2026/August/2026-08-15.md`
    );

    const recoveredRoot = vault.getReservedFolder('daily-notes');
    expect(recoveredRoot).toBeDefined();
    expect(recoveredRoot!.parentId).toBeNull();
    const month = vault.getFolder(monthFolderId);
    expect(month).toBeDefined();
    const year = vault.getFolder(month!.parentId!);
    expect(year!.parentId).toBe(recoveredRoot!.id);
  });

  it('creates the Daily Notes directory on disk without a .folder.md — a reserved folder never carries an identity file', async () => {
    const { vault, folderOperations, fileSystem } = setup(
      [],
      ['year-2026', 'month-august'],
      { includeDailyNotesRoot: false }
    );
    const service = new DailyNoteService();

    await service.ensureFolderChain(
      vault,
      folderOperations,
      `${ROOT}/Daily Notes/2026/August/2026-08-15.md`
    );

    expect(await fileSystem.exists(`${ROOT}/Daily Notes`)).toBe(true);
    expect(await fileSystem.exists(`${ROOT}/Daily Notes/.folder.md`)).toBe(false);
    // The year/month levels are ordinary user-shaped folders (created via
    // FolderOperations.create(), same as every other folder), so they DO
    // get one — only the reserved root itself is exempt.
    expect(await fileSystem.exists(`${ROOT}/Daily Notes/2026/.folder.md`)).toBe(true);
  });

  it('never creates a second Daily Notes folder across repeated recovery + creation', async () => {
    const { vault, folderOperations } = setup(
      [],
      ['year-2026', 'month-august', 'year-2027', 'month-september'],
      { includeDailyNotesRoot: false }
    );
    const service = new DailyNoteService();

    await service.ensureFolderChain(
      vault,
      folderOperations,
      `${ROOT}/Daily Notes/2026/August/2026-08-15.md`
    );
    const firstRootId = vault.getReservedFolder('daily-notes')!.id;

    await service.ensureFolderChain(
      vault,
      folderOperations,
      `${ROOT}/Daily Notes/2027/September/2027-09-01.md`
    );
    const secondRootId = vault.getReservedFolder('daily-notes')!.id;

    expect(secondRootId).toBe(firstRootId);
    expect(
      Array.from(vault.folders()).filter((folder) => folder.path === `${ROOT}/Daily Notes`)
    ).toHaveLength(1);
  });

  it('does nothing (no recreation) when the Daily Notes folder is already present', async () => {
    const { vault, folderOperations } = setup([], ['year-2026', 'month-august']);
    const existingRootId = vault.getReservedFolder('daily-notes')!.id;
    const service = new DailyNoteService();

    await service.ensureFolderChain(
      vault,
      folderOperations,
      `${ROOT}/Daily Notes/2026/August/2026-08-15.md`
    );

    expect(vault.getReservedFolder('daily-notes')!.id).toBe(existingRootId);
  });
});

// DailyNoteService.ensurePage() was retired by ADR-017: creating today's
// note through the Gate is no longer this service's job (it owns
// path/directory conventions only). The equivalent behavior — resolving a
// deterministic path to either the real Vault page or an unpersisted
// draft, and persisting that draft correctly on first save — is now
// PageOperations.openAtPath()'s responsibility, covered in
// PageOperations.test.ts's "drafts (ADR-017)" describe block.
