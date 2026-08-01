import { describe, expect, it } from 'vitest';
import { DailyNoteService } from './DailyNoteService';
import { PageCreator } from '../page/PageCreator';
import { PageFactory } from '../page/PageFactory';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { PagePersistenceCoordinator } from '../persistence/PagePersistenceCoordinator';
import { MoveService } from '../move/MoveService';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/understand/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/understand/FrontmatterParser';
import { PageRebuilder } from '../../vault/build/PageRebuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Folder } from '../../vault/models/Folder';

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

function makeCoordinator(fileSystem: InMemoryVaultFileSystem, vault: Vault) {
  return new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    new MoveService(vault, fileSystem)
  );
}

function makePageCreator(): PageCreator {
  return new PageCreator(new UuidGenerator(), new PageFactory());
}

describe('DailyNoteService.ensureDirectory', () => {
  it('creates the year/month directory and returns the absolute note path', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const service = new DailyNoteService(fileSystem);
    const date = new Date(2026, 7, 1); // August 1, 2026

    const path = await service.ensureDirectory(date, ROOT);

    expect(path).toBe(`${ROOT}/Daily Notes/2026/August/2026-08-01.md`);
    expect(await fileSystem.exists(`${ROOT}/Daily Notes/2026/August`)).toBe(
      true
    );
  });
});

describe('DailyNoteService.ensurePage', () => {
  it('creates the page through the given Gate when missing, using the resolved folder as parentId', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const service = new DailyNoteService(fileSystem);
    const date = new Date(2026, 7, 1);
    const absolutePath = await service.ensureDirectory(date, ROOT);

    const monthFolder = makeFolder(
      'folder-august',
      `${ROOT}/Daily Notes/2026/August`
    );
    const vault = makeVault([monthFolder]);
    const coordinator = makeCoordinator(fileSystem, vault);
    const pageCreator = makePageCreator();

    await service.ensurePage(absolutePath, vault, coordinator, pageCreator);

    const created = vault.getPageByPath(absolutePath);
    expect(created).toBeDefined();
    expect(created!.parentId).toBe('folder-august');
    expect(await fileSystem.exists(absolutePath)).toBe(true);
  });

  it('falls back to a null parentId if the folder is not in the vault', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const service = new DailyNoteService(fileSystem);
    const date = new Date(2026, 7, 1);
    const absolutePath = await service.ensureDirectory(date, ROOT);

    const vault = makeVault([]);
    const coordinator = makeCoordinator(fileSystem, vault);
    const pageCreator = makePageCreator();

    await service.ensurePage(absolutePath, vault, coordinator, pageCreator);

    const created = vault.getPageByPath(absolutePath);
    expect(created).toBeDefined();
    expect(created!.parentId).toBeNull();
  });

  it('is a no-op if the page already exists in the vault', async () => {
    const fileSystem = new InMemoryVaultFileSystem();
    const service = new DailyNoteService(fileSystem);
    const date = new Date(2026, 7, 1);
    const absolutePath = await service.ensureDirectory(date, ROOT);

    const monthFolder = makeFolder(
      'folder-august',
      `${ROOT}/Daily Notes/2026/August`
    );
    const vault = makeVault([monthFolder]);
    const coordinator = makeCoordinator(fileSystem, vault);
    const pageCreator = makePageCreator();

    await service.ensurePage(absolutePath, vault, coordinator, pageCreator);
    const firstWrite = fileSystem.getFileSync(absolutePath);

    await service.ensurePage(absolutePath, vault, coordinator, pageCreator);
    const secondWrite = fileSystem.getFileSync(absolutePath);

    expect(secondWrite).toBe(firstWrite);
  });
});
