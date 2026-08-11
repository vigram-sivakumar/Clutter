import { describe, expect, it } from 'vitest';
import { PageOperations } from './PageOperations';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { VaultEntryDuplicator } from '../../vault/persistence/VaultEntryDuplicator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { MoveService } from '../../vault/persistence/MoveService';
import { PagePathResolver } from './PagePathResolver';
import { PageCreator } from './PageCreator';
import { PageFactory } from './PageFactory';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { FakeVaultFileSystemWatcher } from '../../vault/testing/FakeVaultFileSystemWatcher';
import { FakeIdGenerator } from '../../vault/testing/FakeIdGenerator';
import { VaultSyncService } from '../../vault/sync/VaultSyncService';
import { FolderOperations } from '../folder/FolderOperations';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from '../folder/FolderCreator';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import type { Page } from '../../vault/models/Page';

const ROOT = '/vault';

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function relativePath(absolutePath: string): string {
  return absolutePath.slice(`${ROOT}/`.length);
}

function pageDocument(id: string, body = 'Content that must survive duplication.'): string {
  return `---\nid: ${id}\n---\n${body}`;
}

function buildPage(path: string, id: string, content = 'Content that must survive duplication.'): Page {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path,
      directoryPath: ROOT,
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

  vault.addPage(buildPage(`${ROOT}/Idea.md`, 'page-1'));

  const fileSystem = new InMemoryVaultFileSystem({
    [`${ROOT}/Idea.md`]: pageDocument('page-1'),
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

  return { vault, fileSystem, watcher, workspace, pageOperations };
}

describe('PageOperations.duplicate', () => {
  it('duplicates a note into a new page with a fresh id, selected once the vault reflects it, with no caller-triggered refresh', async () => {
    const { vault, fileSystem, watcher, workspace, pageOperations } = setup();

    const duplicatePromise = pageOperations.duplicate('page-1');
    await flush();

    watcher.emit({
      type: 'created',
      path: relativePath(`${ROOT}/Idea copy.md`),
      isDirectory: false,
    });
    await flush();

    const newPageId = await duplicatePromise;

    expect(newPageId).not.toBe('page-1');
    expect(vault.getPage(newPageId)?.path).toBe(`${ROOT}/Idea copy.md`);
    expect(await fileSystem.exists(`${ROOT}/Idea copy.md`)).toBe(true);
    expect(await fileSystem.readFile(`${ROOT}/Idea copy.md`)).toContain(
      'Content that must survive duplication.'
    );

    // The original is unchanged.
    expect(vault.getPage('page-1')?.path).toBe(`${ROOT}/Idea.md`);
    expect(await fileSystem.readFile(`${ROOT}/Idea.md`)).toBe(pageDocument('page-1'));

    // Selected without the caller having to force any refresh.
    expect(workspace.activePageId).toBe(newPageId);
  });

  it('reassigns the frontmatter id when the copy collides with the source id, and persists the fix to disk', async () => {
    const { vault, fileSystem, watcher, pageOperations } = setup();

    const duplicatePromise = pageOperations.duplicate('page-1');
    await flush();

    // The raw copy lands on disk with the same frontmatter id as the
    // source (VaultEntryDuplicator copies verbatim) before the watcher's
    // `created` event fires and reconciliation reassigns it.
    expect(await fileSystem.readFile(`${ROOT}/Idea copy.md`)).toContain('id: page-1');

    watcher.emit({
      type: 'created',
      path: relativePath(`${ROOT}/Idea copy.md`),
      isDirectory: false,
    });
    await flush();

    const newPageId = await duplicatePromise;

    expect(newPageId).not.toBe('page-1');
    expect(vault.getPage('page-1')).toBeDefined();
    expect(vault.getPage(newPageId)).toBeDefined();
    // The reassigned id was written back to the duplicate's own frontmatter.
    expect(await fileSystem.readFile(`${ROOT}/Idea copy.md`)).toContain(`id: ${newPageId}`);
    expect(await fileSystem.readFile(`${ROOT}/Idea.md`)).toContain('id: page-1');
  });

  it('avoids a name collision against an existing "<name> copy" page', async () => {
    const { vault, fileSystem, watcher, pageOperations } = setup();

    await fileSystem.writeFile(`${ROOT}/Idea copy.md`, pageDocument('page-existing-copy'));
    vault.addPage(buildPage(`${ROOT}/Idea copy.md`, 'page-existing-copy', 'Existing copy.'));

    const duplicatePromise = pageOperations.duplicate('page-1');
    await flush();

    watcher.emit({
      type: 'created',
      path: relativePath(`${ROOT}/Idea copy 2.md`),
      isDirectory: false,
    });
    await flush();

    const newPageId = await duplicatePromise;

    expect(vault.getPage(newPageId)?.path).toBe(`${ROOT}/Idea copy 2.md`);
    // The pre-existing "copy" page is untouched.
    expect(vault.getPage('page-existing-copy')?.path).toBe(`${ROOT}/Idea copy.md`);
  });
});
