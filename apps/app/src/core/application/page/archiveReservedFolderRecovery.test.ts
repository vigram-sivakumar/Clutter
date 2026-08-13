import { describe, expect, it } from 'vitest';
import { PageOperations } from './PageOperations';
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
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { PagePathResolver } from './PagePathResolver';
import { PageCreator } from './PageCreator';
import { PageFactory } from './PageFactory';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import { FolderOperations } from '../folder/FolderOperations';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from '../folder/FolderCreator';
import { DailyNoteService } from '../daily-notes/DailyNoteService';
import { VaultScanner } from '../../vault/ingest/VaultScanner';
import { VaultBuilder } from '../../vault/ingest/VaultBuilder';
import type { Folder } from '../../vault/models/Folder';

const ROOT = '/vault';

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

/**
 * No Archive folder in the fixture — the scenario under test: the
 * reserved Archive folder is missing (deleted externally, or simply
 * never materialized, since nothing creates it eagerly at startup
 * anymore).
 */
function setup() {
  const vault = makeVault();
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

  return { vault, fileSystem, pageOperations, folderOperations };
}

describe('Archiving a Note survives an externally-deleted Archive folder', () => {
  it('recreates Archive, with no .folder.md, and archives the note successfully', async () => {
    const { vault, fileSystem, pageOperations } = setup();
    const builder = new PageBuilder(ROOT);
    const page = builder.build({
      parentId: null,
      page: {
        path: `${ROOT}/Note.md`,
        directoryPath: ROOT,
        frontmatter: { id: 'page-1' },
        frontmatterAnalysis: { aliases: [] },
        content: 'Body that must survive archiving.',
        analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
      },
    });
    vault.addPage(page);
    fileSystem.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );
    expect(vault.getReservedFolder('archive')).toBeUndefined();

    await pageOperations.archive('page-1');

    expect(vault.getReservedFolder('archive')).toBeDefined();
    expect(await fileSystem.exists(`${ROOT}/Archive`)).toBe(true);
    expect(await fileSystem.exists(`${ROOT}/Archive/.folder.md`)).toBe(false);
    expect(vault.getPage('page-1')!.metadata.status).toBe('archived');
  });

  it('the archived note survives a simulated restart (fresh VaultScanner + VaultBuilder rescan)', async () => {
    const { vault, fileSystem, pageOperations } = setup();
    const builder = new PageBuilder(ROOT);
    const page = builder.build({
      parentId: null,
      page: {
        path: `${ROOT}/Note.md`,
        directoryPath: ROOT,
        frontmatter: { id: 'page-1' },
        frontmatterAnalysis: { aliases: [] },
        content: 'Body that must survive restart.',
        analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
      },
    });
    vault.addPage(page);
    fileSystem.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );

    await pageOperations.archive('page-1');

    const scanResult = await new VaultScanner(fileSystem).scan(ROOT);
    const { vault: restartedVault } = new VaultBuilder(new UuidGenerator()).build(scanResult);

    const rediscovered = restartedVault.getPageByPath(`${ROOT}/Archive/Note.md`);
    expect(rediscovered).toBeDefined();
    expect(rediscovered!.metadata.status).toBe('archived');
    expect(restartedVault.getFolderByPath(`${ROOT}/Archive`)).toBeDefined();
  });
});

describe('Archiving a Folder survives an externally-deleted Archive folder', () => {
  it('recreates Archive and archives the folder successfully', async () => {
    const { vault, fileSystem, folderOperations } = setup();
    const projects: Folder = {
      id: 'folder-projects',
      name: 'Projects',
      path: `${ROOT}/Projects`,
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
    vault.addFolder(projects);
    await fileSystem.createDirectory(projects.path);
    await fileSystem.writeFile(`${projects.path}/.folder.md`, '---\nid: folder-projects\n---\n');
    expect(vault.getReservedFolder('archive')).toBeUndefined();

    await folderOperations.archive('folder-projects');

    expect(vault.getReservedFolder('archive')).toBeDefined();
    const archived = vault.getFolder('folder-projects')!;
    expect(archived.path).toBe(`${ROOT}/Archive/Projects`);
    expect(archived.metadata.status).toBe('archived');
  });

  it('the archived folder survives a simulated restart (fresh VaultScanner + VaultBuilder rescan)', async () => {
    const { vault, fileSystem, folderOperations } = setup();
    const projects: Folder = {
      id: 'folder-projects',
      name: 'Projects',
      path: `${ROOT}/Projects`,
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
    vault.addFolder(projects);
    await fileSystem.createDirectory(projects.path);
    await fileSystem.writeFile(`${projects.path}/.folder.md`, '---\nid: folder-projects\n---\n');

    await folderOperations.archive('folder-projects');

    const scanResult = await new VaultScanner(fileSystem).scan(ROOT);
    const { vault: restartedVault } = new VaultBuilder(new UuidGenerator()).build(scanResult);

    const rediscovered = restartedVault.getFolderByPath(`${ROOT}/Archive/Projects`);
    expect(rediscovered).toBeDefined();
    expect(rediscovered!.metadata.status).toBe('archived');
  });
});
