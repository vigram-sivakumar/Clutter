import { describe, expect, it } from 'vitest';
import { FolderOperations } from './FolderOperations';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from './FolderCreator';
import { PageOperations } from '../page/PageOperations';
import { PagePathResolver } from '../page/PagePathResolver';
import { PageCreator } from '../page/PageCreator';
import { PageFactory } from '../page/PageFactory';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import { VaultEntryDuplicator } from '../../vault/persistence/VaultEntryDuplicator';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { Workspace } from '../../workspace/Workspace';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { MoveService } from '../../vault/persistence/MoveService';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { FakeVaultFileSystemWatcher } from '../../vault/testing/FakeVaultFileSystemWatcher';
import { FakeIdGenerator } from '../../vault/testing/FakeIdGenerator';
import { VaultSyncService } from '../../vault/sync/VaultSyncService';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import type { Folder } from '../../vault/models/Folder';
import type { Page } from '../../vault/models/Page';

const ROOT = '/vault';

const defaultFolderMetadata = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  status: 'active' as const,
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function relativePath(absolutePath: string): string {
  return absolutePath.slice(`${ROOT}/`.length);
}

function makeFolder(id: string, path: string, parentId: string | null = null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: defaultFolderMetadata,
  };
}

function pageDocument(id: string, body = 'Body'): string {
  return `---\nid: ${id}\n---\n${body}`;
}

function buildPage(path: string, id: string, content = 'Body'): Page {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content,
      analysis: {
        headings: [],
        blockReferences: [],
        tasks: [],
        tags: [],
        links: [],
        embeds: [],
      },
    },
  });
}

function setup() {
  const vault = new Vault(
    ROOT,
    [],
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );

  const fileSystem = new InMemoryVaultFileSystem();
  const watcher = new FakeVaultFileSystemWatcher();
  const frontmatterSerializer = new FrontmatterSerializer();
  const documentRegistry = new DocumentRegistry();

  const moveService = new MoveService(vault, fileSystem);
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    frontmatterSerializer,
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService
  );

  const workspace = new Workspace();
  const duplicator = new VaultEntryDuplicator(fileSystem);

  const folderOperations = new FolderOperations(
    vault,
    workspace,
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(new UuidGenerator()),
    () => {},
    documentRegistry,
    new SaveCoordinator(),
    () => {},
    duplicator
  );

  const pageOperations = new PageOperations(
    vault,
    workspace,
    documentRegistry,
    new SaveCoordinator(),
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    folderOperations,
    new DailyNoteService(),
    () => {},
    duplicator
  );

  new VaultSyncService(
    vault,
    fileSystem,
    watcher,
    documentRegistry,
    frontmatterSerializer,
    new FakeIdGenerator()
  );

  return { vault, fileSystem, watcher, workspace, folderOperations, pageOperations };
}

describe('FolderOperations.duplicate', () => {
  it('duplicates an empty folder into a new folder with a fresh id, selecting it once the vault reflects it', async () => {
    const { vault, fileSystem, watcher, workspace, folderOperations } = setup();

    await fileSystem.createDirectory(`${ROOT}/Projects`);
    vault.addFolder(makeFolder('folder-projects', `${ROOT}/Projects`));

    const duplicatePromise = folderOperations.duplicate('folder-projects');
    await flush();

    watcher.emit({
      type: 'created',
      path: relativePath(`${ROOT}/Projects copy`),
      isDirectory: true,
    });
    await flush();

    const newFolderId = await duplicatePromise;

    expect(newFolderId).not.toBe('folder-projects');
    expect(vault.getFolder(newFolderId)?.path).toBe(`${ROOT}/Projects copy`);
    expect(await fileSystem.exists(`${ROOT}/Projects copy`)).toBe(true);

    // The original is unchanged.
    expect(vault.getFolder('folder-projects')?.path).toBe(`${ROOT}/Projects`);

    // Selected without the caller having to force any refresh.
    expect(workspace.activeFolderId).toBe(newFolderId);
  });

  it('duplicates a folder containing nested folders and notes, assigning every duplicated entity a unique id', async () => {
    const { vault, fileSystem, watcher, folderOperations } = setup();

    await fileSystem.createDirectory(`${ROOT}/Projects/Q1`);
    await fileSystem.writeFile(`${ROOT}/Projects/Overview.md`, pageDocument('page-overview'));
    await fileSystem.writeFile(`${ROOT}/Projects/Q1/Plan.md`, pageDocument('page-plan'));

    vault.addFolder(makeFolder('folder-projects', `${ROOT}/Projects`));
    vault.addFolder(makeFolder('folder-q1', `${ROOT}/Projects/Q1`, 'folder-projects'));
    vault.addPage(buildPage(`${ROOT}/Projects/Overview.md`, 'page-overview'));
    vault.addPage(buildPage(`${ROOT}/Projects/Q1/Plan.md`, 'page-plan'));

    const duplicatePromise = folderOperations.duplicate('folder-projects');
    await flush();

    watcher.emit({
      type: 'created',
      path: relativePath(`${ROOT}/Projects copy`),
      isDirectory: true,
    });
    await flush();

    const newFolderId = await duplicatePromise;

    const newQ1 = vault.getFolderByPath(`${ROOT}/Projects copy/Q1`);
    const newOverview = vault.getPageByPath(`${ROOT}/Projects copy/Overview.md`);
    const newPlan = vault.getPageByPath(`${ROOT}/Projects copy/Q1/Plan.md`);

    expect(newQ1).toBeDefined();
    expect(newOverview).toBeDefined();
    expect(newPlan).toBeDefined();

    // Every duplicated entity — the folder itself, its subfolder, and both
    // notes — got a fresh, unique id, distinct from every original id.
    const allIds = [
      newFolderId,
      newQ1!.id,
      newOverview!.id,
      newPlan!.id,
      'folder-projects',
      'folder-q1',
      'page-overview',
      'page-plan',
    ];
    expect(new Set(allIds).size).toBe(allIds.length);

    // Original ids/paths are untouched.
    expect(vault.getFolder('folder-projects')?.path).toBe(`${ROOT}/Projects`);
    expect(vault.getFolder('folder-q1')?.path).toBe(`${ROOT}/Projects/Q1`);
    expect(vault.getPage('page-overview')?.path).toBe(`${ROOT}/Projects/Overview.md`);
    expect(vault.getPage('page-plan')?.path).toBe(`${ROOT}/Projects/Q1/Plan.md`);

    // The reassigned ids were persisted to the duplicate's own frontmatter.
    expect(await fileSystem.readFile(`${ROOT}/Projects copy/Overview.md`)).toContain(
      `id: ${newOverview!.id}`
    );
    expect(await fileSystem.readFile(`${ROOT}/Projects copy/Q1/Plan.md`)).toContain(
      `id: ${newPlan!.id}`
    );
  });

  it('does not manufacture a .folder.md for a duplicate when the original never had one', async () => {
    const { vault, fileSystem, watcher, folderOperations } = setup();

    await fileSystem.createDirectory(`${ROOT}/Projects`);
    vault.addFolder(makeFolder('folder-projects', `${ROOT}/Projects`));

    expect(await fileSystem.exists(`${ROOT}/Projects/.folder.md`)).toBe(false);

    const duplicatePromise = folderOperations.duplicate('folder-projects');
    await flush();

    watcher.emit({
      type: 'created',
      path: relativePath(`${ROOT}/Projects copy`),
      isDirectory: true,
    });
    await flush();

    await duplicatePromise;

    expect(await fileSystem.exists(`${ROOT}/Projects copy/.folder.md`)).toBe(false);
  });

  it('avoids a name collision against an existing "<name> copy" folder', async () => {
    const { vault, fileSystem, watcher, folderOperations } = setup();

    await fileSystem.createDirectory(`${ROOT}/Projects`);
    await fileSystem.createDirectory(`${ROOT}/Projects copy`);
    vault.addFolder(makeFolder('folder-projects', `${ROOT}/Projects`));
    vault.addFolder(makeFolder('folder-existing-copy', `${ROOT}/Projects copy`));

    const duplicatePromise = folderOperations.duplicate('folder-projects');
    await flush();

    watcher.emit({
      type: 'created',
      path: relativePath(`${ROOT}/Projects copy 2`),
      isDirectory: true,
    });
    await flush();

    const newFolderId = await duplicatePromise;

    expect(vault.getFolder(newFolderId)?.path).toBe(`${ROOT}/Projects copy 2`);
    // The pre-existing "copy" folder is untouched.
    expect(vault.getFolder('folder-existing-copy')?.path).toBe(`${ROOT}/Projects copy`);
  });
});
