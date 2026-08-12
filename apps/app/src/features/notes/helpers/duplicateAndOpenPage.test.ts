import { describe, expect, it, vi } from 'vitest';
import { duplicateAndOpenPage } from './duplicateAndOpenPage';
import { PageOperations } from '@core/application/page/PageOperations';
import { PagePersistenceCoordinator } from '@core/vault/persistence/PagePersistenceCoordinator';
import { VaultEntryDuplicator } from '@core/vault/persistence/VaultEntryDuplicator';
import { Workspace } from '@core/workspace/Workspace';
import { DocumentRegistry } from '@core/engine/DocumentRegistry';
import { SaveCoordinator } from '@core/engine/SaveCoordinator';
import { Vault } from '@core/vault/models/Vault';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '@core/vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import { PageRebuilder } from '@core/vault/ingest/PageRebuilder';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';
import { MoveService } from '@core/vault/persistence/MoveService';
import { PagePathResolver } from '@core/application/page/PagePathResolver';
import { PageCreator } from '@core/application/page/PageCreator';
import { PageFactory } from '@core/application/page/PageFactory';
import { UuidGenerator } from '@core/shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { FakeVaultFileSystemWatcher } from '@core/vault/testing/FakeVaultFileSystemWatcher';
import { FakeIdGenerator } from '@core/vault/testing/FakeIdGenerator';
import { VaultSyncService } from '@core/vault/sync/VaultSyncService';
import { FolderOperations } from '@core/application/folder/FolderOperations';
import { FolderPathResolver } from '@core/vault/persistence/FolderPathResolver';
import { FolderCreator } from '@core/application/folder/FolderCreator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';

describe('duplicateAndOpenPage', () => {
  it('duplicates the page, then opens the resulting duplicate', async () => {
    const duplicate = vi.fn().mockResolvedValue('page-copy');
    const open = vi.fn().mockResolvedValue(undefined);
    const pageOperations = { duplicate, open } as unknown as PageOperations;

    await duplicateAndOpenPage(pageOperations, 'page-1');

    expect(duplicate).toHaveBeenCalledWith('page-1');
    expect(open).toHaveBeenCalledWith('page-copy');
    // open() is called with the *duplicate's* id, never the source's.
    expect(open).not.toHaveBeenCalledWith('page-1');
  });

  it('opens only after duplicate() resolves, using its returned id', async () => {
    const callOrder: string[] = [];
    const duplicate = vi.fn().mockImplementation(async () => {
      callOrder.push('duplicate');
      return 'page-copy';
    });
    const open = vi.fn().mockImplementation(async () => {
      callOrder.push('open');
    });
    const pageOperations = { duplicate, open } as unknown as PageOperations;

    await duplicateAndOpenPage(pageOperations, 'page-1');

    expect(callOrder).toEqual(['duplicate', 'open']);
  });
});

describe('duplicateAndOpenPage: end-to-end topbar scenario', () => {
  const ROOT = '/vault';

  function flush(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function relativePath(absolutePath: string): string {
    return absolutePath.slice(`${ROOT}/`.length);
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

    vault.addPage(
      new PageBuilder().build({
        parentId: null,
        page: {
          path: `${ROOT}/Note A.md`,
          directoryPath: ROOT,
          frontmatter: { id: 'page-a' },
          frontmatterAnalysis: { aliases: [] },
          content: 'Body',
          analysis: {
            headings: [],
            blockReferences: [],
            tasks: [],
            tags: [],
            links: [],
            embeds: [],
          },
        },
      })
    );

    const fileSystem = new InMemoryVaultFileSystem({
      [`${ROOT}/Note A.md`]: '---\nid: page-a\n---\nBody',
    });
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
      () => {}
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

    return { vault, watcher, workspace, pageOperations };
  }

  it('Note A open, topbar-duplicating Note A opens the resulting copy', async () => {
    const { vault, watcher, workspace, pageOperations } = setup();

    // Note A is the currently open page — the topbar's Duplicate targets it.
    workspace.openPage('page-a');
    expect(workspace.activePageId).toBe('page-a');

    const resultPromise = duplicateAndOpenPage(pageOperations, 'page-a');
    await flush();

    watcher.emit({
      type: 'created',
      path: relativePath(`${ROOT}/Note A copy.md`),
      isDirectory: false,
    });
    await flush();

    await resultPromise;

    const copyId = vault.getPageByPath(`${ROOT}/Note A copy.md`)?.id;
    expect(copyId).toBeDefined();
    expect(copyId).not.toBe('page-a');
    // The copy is now open — not Note A, and not left unopened.
    expect(workspace.activePageId).toBe(copyId);
  });
});
