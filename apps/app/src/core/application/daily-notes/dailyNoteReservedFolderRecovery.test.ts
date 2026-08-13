import { describe, expect, it } from 'vitest';
import { PageOperations } from '../page/PageOperations';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { MoveService } from '../../vault/persistence/MoveService';
import { PagePathResolver } from '../page/PagePathResolver';
import { PageCreator } from '../page/PageCreator';
import { PageFactory } from '../page/PageFactory';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { FolderOperations } from '../folder/FolderOperations';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from '../folder/FolderCreator';
import { DailyNoteService } from './DailyNoteService';
import { VaultScanner } from '../../vault/ingest/VaultScanner';
import { VaultBuilder } from '../../vault/ingest/VaultBuilder';
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

function makeFolder(id: string, path: string): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId: null,
    metadata: defaultFolderMetadata,
  };
}

/**
 * The scenario under test: the reserved Daily Notes folder is missing
 * from Vault at setup time — the in-memory state VaultSyncService.
 * handleDeleted() would produce after reconciling an external deletion
 * of Daily Notes/ while the app kept running. Only Archive is present,
 * mirroring the reported repro exactly (a normal vault, Daily Notes
 * specifically deleted).
 */
function setup() {
  const archive = makeFolder('folder-archive', `${ROOT}/Archive`);
  const vault = new Vault(
    ROOT,
    [],
    [archive],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  const fileSystem = new InMemoryVaultFileSystem();
  const workspace = new Workspace();
  const documentRegistry = new DocumentRegistry();
  const saveCoordinator = new SaveCoordinator();
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
    new FolderCreator(new UuidGenerator()),
    () => {},
    documentRegistry,
    saveCoordinator,
    () => {}
  );
  const pageOperations = new PageOperations(
    vault,
    workspace,
    documentRegistry,
    saveCoordinator,
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    folderOperations,
    new DailyNoteService(),
    () => {}
  );

  return { vault, fileSystem, pageOperations };
}

describe('Daily Note creation survives an externally-deleted Daily Notes folder', () => {
  it('persists successfully when the reserved Daily Notes folder is missing from Vault at save time', async () => {
    const { pageOperations } = setup();

    const path = `${ROOT}/Daily Notes/2026/August/2026-08-12.md`;
    const id = await pageOperations.openAtPath(path, { type: 'daily-note' });

    await expect(pageOperations.save(id, "Today's entry")).resolves.toBeUndefined();
  });

  it('recreates the Daily Notes root, and the year/month chain under it, then writes the note', async () => {
    const { vault, fileSystem, pageOperations } = setup();
    const path = `${ROOT}/Daily Notes/2026/August/2026-08-12.md`;

    const id = await pageOperations.openAtPath(path, { type: 'daily-note' });
    await pageOperations.save(id, "Today's entry");

    expect(await fileSystem.exists(`${ROOT}/Daily Notes`)).toBe(true);
    expect(await fileSystem.exists(`${ROOT}/Daily Notes/.folder.md`)).toBe(false);
    expect(await fileSystem.exists(path)).toBe(true);

    const persisted = vault.getPage(id);
    expect(persisted).toBeDefined();
    expect(persisted!.path).toBe(path);
    expect(persisted!.type).toBe('daily-note');
  });

  it('never creates a second Daily Notes folder across two notes created in the same recovered session', async () => {
    const { vault, pageOperations } = setup();

    const firstId = await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/2026/August/2026-08-12.md`,
      { type: 'daily-note' }
    );
    await pageOperations.save(firstId, 'First entry');

    const secondId = await pageOperations.openAtPath(
      `${ROOT}/Daily Notes/2026/September/2026-09-01.md`,
      { type: 'daily-note' }
    );
    await pageOperations.save(secondId, 'Second entry');

    const dailyNotesFolders = Array.from(vault.folders()).filter(
      (folder) => folder.path === `${ROOT}/Daily Notes`
    );
    expect(dailyNotesFolders).toHaveLength(1);
  });

  // The regression test for the reported bug: the note must not merely
  // "appear" in the running session — it must actually be durable, i.e.
  // rediscoverable by a fresh scan of the same underlying filesystem, the
  // same thing a real app restart does (VaultBuilder full rescan, no
  // reliance on the in-memory Vault that was just mutated).
  it('the newly-created Daily Note survives a simulated restart (fresh VaultScanner + VaultBuilder rescan)', async () => {
    const { fileSystem, pageOperations } = setup();
    const path = `${ROOT}/Daily Notes/2026/August/2026-08-12.md`;

    const id = await pageOperations.openAtPath(path, { type: 'daily-note' });
    await pageOperations.save(id, "Today's entry, written before the restart");

    // Simulate a restart: a brand-new Vault built purely from a fresh scan
    // of the same "disk" (fileSystem) — no reference to the original
    // in-memory Vault instance at all.
    const scanResult = await new VaultScanner(fileSystem).scan(ROOT);
    const { vault: restartedVault } = new VaultBuilder(new UuidGenerator()).build(scanResult);

    const rediscovered = restartedVault.getPageByPath(path);
    expect(rediscovered).toBeDefined();
    expect(rediscovered!.type).toBe('daily-note');
    expect(rediscovered!.source.markdown.trim()).toBe(
      "Today's entry, written before the restart"
    );

    const dailyNotesFolder = restartedVault.getFolderByPath(`${ROOT}/Daily Notes`);
    expect(dailyNotesFolder).toBeDefined();
  });
});
