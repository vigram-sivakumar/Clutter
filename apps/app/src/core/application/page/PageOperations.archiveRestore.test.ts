import { describe, expect, it } from 'vitest';
import { PageOperations } from './PageOperations';
import { PagePersistenceCoordinator } from '../persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/ingest/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/ingest/FrontmatterParser';
import { PageRebuilder } from '../../vault/ingest/PageRebuilder';
import { MoveService } from '../move/MoveService';
import { PageBuilder } from '../../vault/ingest/PageBuilder';
import { PagePathResolver } from './PagePathResolver';
import { PageCreator } from './PageCreator';
import { PageFactory } from './PageFactory';
import { UuidGenerator } from '../../shared/identity/UuidGenerator';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Folder } from '../../vault/models/Folder';
import type { Page } from '../../vault/models/Page';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

const ROOT = '/vault';
const ARCHIVE_FOLDER_ID = 'folder-archive';
const INBOX_FOLDER_ID = 'folder-inbox';
const PROJECTS_FOLDER_ID = 'folder-projects';
const DESIGN_FOLDER_ID = 'folder-design';

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

function makeArchiveFolder(): Folder {
  return {
    id: ARCHIVE_FOLDER_ID,
    name: 'Archive',
    path: `${ROOT}/Archive`,
    parentId: null,
    metadata: defaultFolderMetadata,
  };
}

function makeInboxFolder(): Folder {
  return {
    id: INBOX_FOLDER_ID,
    name: 'Inbox',
    path: `${ROOT}/Inbox`,
    parentId: null,
    metadata: defaultFolderMetadata,
  };
}

function makeProjectsFolder(): Folder {
  return {
    id: PROJECTS_FOLDER_ID,
    name: 'Projects',
    path: `${ROOT}/Projects`,
    parentId: null,
    metadata: defaultFolderMetadata,
  };
}

function makeDesignFolder(path = `${ROOT}/Projects/Design`): Folder {
  return {
    id: DESIGN_FOLDER_ID,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId: PROJECTS_FOLDER_ID,
    metadata: defaultFolderMetadata,
  };
}

function buildActivePage(overrides?: { parentId?: string | null; path?: string }): Page {
  const builder = new PageBuilder();
  const parentId = overrides?.parentId ?? null;
  const path = overrides?.path ?? `${ROOT}/Note.md`;
  const directoryPath = path.slice(0, path.lastIndexOf('/'));

  return builder.build({
    parentId,
    page: {
      path,
      directoryPath,
      frontmatter: { id: 'page-1', icon: '📌', favorite: true },
      frontmatterAnalysis: { aliases: [] },
      content: 'Content that must survive archiving.',
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

function makeVault(pages: Page[], folders: Folder[] = [makeArchiveFolder()]): Vault {
  return new Vault(
    ROOT,
    pages,
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
}

function archivePathFor(page: Page): string {
  const filename = page.path.slice(page.path.lastIndexOf('/') + 1);
  return `${ROOT}/Archive/${filename}`;
}

function buildPageOperations(vault: Vault, fileSystem: VaultFileSystem): PageOperations {
  const moveService = new MoveService(vault, fileSystem);
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService
  );
  return new PageOperations(
    vault,
    new Workspace(),
    new DocumentRegistry(),
    new SaveCoordinator(),
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory())
  );
}

function setup(page: Page, vault?: Vault) {
  const resolvedVault = vault ?? makeVault([page], [makeArchiveFolder(), makeInboxFolder()]);
  const fileSystem = new InMemoryVaultFileSystem();
  const serializer = new FrontmatterSerializer();
  fileSystem.seedFile(page.path, serializer.serializeDocument(page, page.source.markdown));

  const pageOperations = buildPageOperations(resolvedVault, fileSystem);

  return { vault: resolvedVault, fileSystem, pageOperations, serializer };
}

async function archivePage(page: Page, folders: Folder[] = [makeArchiveFolder(), makeInboxFolder()]) {
  const context = setup(page, makeVault([page], folders));
  await context.pageOperations.archive(page.id);
  return context;
}

function buildArchivedPage(options: {
  originalParentId: string | null;
  originalPath: string;
  path?: string;
}): Page {
  const archivePath = options.path ?? `${ROOT}/Archive/Note.md`;
  const builder = new PageBuilder();

  return builder.build({
    parentId: ARCHIVE_FOLDER_ID,
    page: {
      path: archivePath,
      directoryPath: `${ROOT}/Archive`,
      frontmatter: {
        id: 'page-1',
        icon: '📌',
        favorite: true,
        status: 'archived',
        archivedAt: '2026-07-29T00:00:00.000Z',
        originalPath: options.originalPath,
        originalParentId: options.originalParentId,
      },
      frontmatterAnalysis: { aliases: [] },
      content: 'Content that must survive restoring.',
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

describe('PageOperations.archive()', () => {
  it('sets status to archived and stamps archivedAt', async () => {
    const page = buildActivePage();
    const { vault, pageOperations } = setup(page);

    await pageOperations.archive(page.id);

    const archived = vault.getPage(page.id)!;
    expect(archived.metadata.status).toBe('archived');
    expect(archived.metadata.archivedAt).not.toBeNull();
  });

  it('moves the page file into the Archive folder', async () => {
    const page = buildActivePage();
    const { vault, fileSystem, pageOperations } = setup(page);
    const destinationPath = archivePathFor(page);

    await pageOperations.archive(page.id);

    const archived = vault.getPage(page.id)!;
    expect(archived.path).toBe(destinationPath);
    expect(archived.parentId).toBe(ARCHIVE_FOLDER_ID);
    expect(fileSystem.hasFileSync(destinationPath)).toBe(true);
    expect(fileSystem.hasFileSync(page.path)).toBe(false);
  });

  it('captures originalPath and originalParentId before moving', async () => {
    const projects = makeProjectsFolder();
    const page = buildActivePage({
      parentId: PROJECTS_FOLDER_ID,
      path: `${ROOT}/Projects/Note.md`,
    });
    const { vault, pageOperations } = setup(
      page,
      makeVault([page], [makeArchiveFolder(), makeInboxFolder(), projects])
    );

    await pageOperations.archive(page.id);

    const archived = vault.getPage(page.id)!;
    expect(archived.metadata.originalPath).toBe(`${ROOT}/Projects/Note.md`);
    expect(archived.metadata.originalParentId).toBe(PROJECTS_FOLDER_ID);
  });

  it('does not lose the page content while archiving', async () => {
    const page = buildActivePage();
    const { vault, pageOperations } = setup(page);

    await pageOperations.archive(page.id);

    expect(vault.getPage(page.id)!.source.markdown).toBe(
      'Content that must survive archiving.'
    );
  });

  it('preserves unrelated original metadata (icon, favorite) while archiving', async () => {
    const page = buildActivePage();
    const { vault, pageOperations } = setup(page);

    await pageOperations.archive(page.id);

    const archived = vault.getPage(page.id)!;
    expect(archived.metadata.icon).toBe('📌');
    expect(archived.metadata.favorite).toBe(true);
  });

  it('survives a full reload from disk: archive metadata round-trips through serialize -> write -> parse -> rebuild', async () => {
    const projects = makeProjectsFolder();
    const page = buildActivePage({
      parentId: PROJECTS_FOLDER_ID,
      path: `${ROOT}/Projects/Note.md`,
    });
    const { vault, fileSystem, pageOperations } = setup(
      page,
      makeVault([page], [makeArchiveFolder(), makeInboxFolder(), projects])
    );

    await pageOperations.archive(page.id);

    const archived = vault.getPage(page.id)!;
    const destinationPath = archivePathFor(page);

    const diskContent = await fileSystem.readFile(destinationPath);
    const parsed = new FrontmatterParser().parse(diskContent);
    const reloaded = new PageRebuilder().rebuild(archived, parsed);

    expect(reloaded.path).toBe(destinationPath);
    expect(reloaded.parentId).toBe(ARCHIVE_FOLDER_ID);
    expect(reloaded.metadata.status).toBe('archived');
    expect(reloaded.metadata.archivedAt).not.toBeNull();
    expect(reloaded.metadata.originalPath).toBe(`${ROOT}/Projects/Note.md`);
    expect(reloaded.metadata.originalParentId).toBe(PROJECTS_FOLDER_ID);
    expect(reloaded.source.markdown).toBe('Content that must survive archiving.');
    expect(reloaded.metadata.icon).toBe('📌');
  });

  it('throws when Archive/Note.md already exists', async () => {
    const page = buildActivePage();
    const occupant = new PageBuilder().build({
      parentId: ARCHIVE_FOLDER_ID,
      page: {
        path: `${ROOT}/Archive/Note.md`,
        directoryPath: `${ROOT}/Archive`,
        frontmatter: { id: 'page-occupant' },
        frontmatterAnalysis: { aliases: [] },
        content: 'Existing archive occupant.',
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

    const vault = makeVault([page, occupant]);
    const fileSystem = new InMemoryVaultFileSystem();
    const serializer = new FrontmatterSerializer();
    fileSystem.seedFile(page.path, serializer.serializeDocument(page, page.source.markdown));
    fileSystem.seedFile(
      occupant.path,
      serializer.serializeDocument(occupant, occupant.source.markdown)
    );

    const pageOperations = buildPageOperations(vault, fileSystem);

    await expect(pageOperations.archive(page.id)).rejects.toThrow(/Path already in use/);
    expect(fileSystem.hasFileSync(page.path)).toBe(true);
    expect(vault.getPage(page.id)!.metadata.status).toBe('active');
  });

  it('throws when the page is already archived', async () => {
    const page = buildActivePage();
    const { vault, fileSystem, pageOperations } = setup(page);

    await pageOperations.archive(page.id);

    await expect(pageOperations.archive(page.id)).rejects.toThrow(/already archived/);
    expect(fileSystem.hasFileSync(archivePathFor(page))).toBe(true);
    expect(vault.getPage(page.id)!.metadata.status).toBe('archived');
  });

  it('throws when the Archive folder is missing from the vault', async () => {
    const page = buildActivePage();
    const vault = makeVault([page], []);
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );
    const pageOperations = buildPageOperations(vault, fileSystem);

    await expect(pageOperations.archive(page.id)).rejects.toThrow(/Archive folder not found/);
    expect(fileSystem.hasFileSync(page.path)).toBe(true);
  });

  it('throws for an unknown page id and does not write to disk', async () => {
    const page = buildActivePage();
    const { fileSystem, pageOperations } = setup(page);

    await expect(pageOperations.archive('does-not-exist')).rejects.toThrow(/Page not found/);
    expect(fileSystem.hasFileSync(page.path)).toBe(true);
    expect(fileSystem.hasFileSync(archivePathFor(page))).toBe(false);
  });
});

describe('PageOperations.restore()', () => {
  it('restores the page to its original folder location', async () => {
    const design = makeDesignFolder();
    const page = buildActivePage({
      parentId: DESIGN_FOLDER_ID,
      path: `${ROOT}/Projects/Design/Note.md`,
    });
    const { vault, fileSystem, pageOperations } = await archivePage(page, [
      makeArchiveFolder(),
      makeInboxFolder(),
      makeProjectsFolder(),
      design,
    ]);

    await pageOperations.restore(page.id);

    const restored = vault.getPage(page.id)!;
    expect(restored.path).toBe(`${ROOT}/Projects/Design/Note.md`);
    expect(restored.parentId).toBe(DESIGN_FOLDER_ID);
    expect(restored.metadata.status).toBe('active');
    expect(restored.metadata.archivedAt).toBeNull();
    expect(restored.metadata.originalPath).toBeNull();
    expect(restored.metadata.originalParentId).toBeNull();
    expect(fileSystem.hasFileSync(`${ROOT}/Projects/Design/Note.md`)).toBe(true);
    expect(fileSystem.hasFileSync(archivePathFor(page))).toBe(false);
    expect(restored.source.markdown).toBe('Content that must survive archiving.');
  });

  it('uses the current folder path when the original folder was renamed', async () => {
    const renamedDesign = makeDesignFolder(`${ROOT}/Projects/Product Design`);
    const archivedPage = buildArchivedPage({
      originalParentId: DESIGN_FOLDER_ID,
      originalPath: `${ROOT}/Projects/Design/Note.md`,
    });
    const vault = makeVault(
      [archivedPage],
      [makeArchiveFolder(), makeInboxFolder(), makeProjectsFolder(), renamedDesign]
    );
    const { fileSystem, pageOperations } = setup(archivedPage, vault);

    await pageOperations.restore(archivedPage.id);

    const restored = vault.getPage(archivedPage.id)!;
    expect(restored.path).toBe(`${ROOT}/Projects/Product Design/Note.md`);
    expect(restored.parentId).toBe(DESIGN_FOLDER_ID);
    expect(restored.metadata.originalPath).toBeNull();
    expect(fileSystem.hasFileSync(`${ROOT}/Projects/Product Design/Note.md`)).toBe(true);
  });

  it('falls back to Inbox when the original folder no longer exists', async () => {
    const archivedPage = buildArchivedPage({
      originalParentId: DESIGN_FOLDER_ID,
      originalPath: `${ROOT}/Projects/Design/Note.md`,
    });
    const vault = makeVault([archivedPage], [makeArchiveFolder(), makeInboxFolder()]);
    const { fileSystem, pageOperations } = setup(archivedPage, vault);

    await pageOperations.restore(archivedPage.id);

    const restored = vault.getPage(archivedPage.id)!;
    expect(restored.path).toBe(`${ROOT}/Inbox/Note.md`);
    expect(restored.parentId).toBe(INBOX_FOLDER_ID);
    expect(fileSystem.hasFileSync(`${ROOT}/Inbox/Note.md`)).toBe(true);
    expect(fileSystem.hasFileSync(archivedPage.path)).toBe(false);
  });

  it('falls back to vault root when the original folder and Inbox are unavailable', async () => {
    const archivedPage = buildArchivedPage({
      originalParentId: DESIGN_FOLDER_ID,
      originalPath: `${ROOT}/Projects/Design/Note.md`,
    });
    const vault = makeVault([archivedPage], [makeArchiveFolder()]);
    const { fileSystem, pageOperations } = setup(archivedPage, vault);

    await pageOperations.restore(archivedPage.id);

    const restored = vault.getPage(archivedPage.id)!;
    expect(restored.path).toBe(`${ROOT}/Note.md`);
    expect(restored.parentId).toBeNull();
    expect(fileSystem.hasFileSync(`${ROOT}/Note.md`)).toBe(true);
    expect(fileSystem.hasFileSync(archivedPage.path)).toBe(false);
  });

  it('throws when the restore destination path is already occupied', async () => {
    const design = makeDesignFolder();
    const page = buildActivePage({
      parentId: DESIGN_FOLDER_ID,
      path: `${ROOT}/Projects/Design/Note.md`,
    });
    const occupant = new PageBuilder().build({
      parentId: DESIGN_FOLDER_ID,
      page: {
        path: `${ROOT}/Projects/Design/Note.md`,
        directoryPath: `${ROOT}/Projects/Design`,
        frontmatter: { id: 'page-occupant' },
        frontmatterAnalysis: { aliases: [] },
        content: 'Existing occupant.',
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

    const folders = [makeArchiveFolder(), makeInboxFolder(), makeProjectsFolder(), design];
    const { vault, fileSystem, pageOperations, serializer } = await archivePage(page, folders);
    vault.addPage(occupant);
    fileSystem.seedFile(
      occupant.path,
      serializer.serializeDocument(occupant, occupant.source.markdown)
    );

    await expect(pageOperations.restore(page.id)).rejects.toThrow(/Path already in use/);
    expect(vault.getPage(page.id)!.metadata.status).toBe('archived');
    expect(fileSystem.hasFileSync(archivePathFor(page))).toBe(true);
  });

  it('survives a full reload from disk with cleared archive metadata', async () => {
    const design = makeDesignFolder();
    const page = buildActivePage({
      parentId: DESIGN_FOLDER_ID,
      path: `${ROOT}/Projects/Design/Note.md`,
    });
    const { vault, fileSystem, pageOperations } = await archivePage(page, [
      makeArchiveFolder(),
      makeInboxFolder(),
      makeProjectsFolder(),
      design,
    ]);

    await pageOperations.restore(page.id);

    const restored = vault.getPage(page.id)!;
    const diskContent = await fileSystem.readFile(restored.path);
    const parsed = new FrontmatterParser().parse(diskContent);
    const reloaded = new PageRebuilder().rebuild(restored, parsed);

    expect(reloaded.metadata.status).toBe('active');
    expect(reloaded.metadata.archivedAt).toBeNull();
    expect(reloaded.metadata.originalPath).toBeNull();
    expect(reloaded.metadata.originalParentId).toBeNull();
    expect(reloaded.source.markdown).toBe('Content that must survive archiving.');
    expect(reloaded.metadata.icon).toBe('📌');
  });

  it('throws when the page is not archived', async () => {
    const page = buildActivePage();
    const { fileSystem, pageOperations } = setup(page);

    await expect(pageOperations.restore(page.id)).rejects.toThrow(/not archived/);
    expect(fileSystem.hasFileSync(page.path)).toBe(true);
  });

  it('throws when restoring an already restored page', async () => {
    const design = makeDesignFolder();
    const page = buildActivePage({
      parentId: DESIGN_FOLDER_ID,
      path: `${ROOT}/Projects/Design/Note.md`,
    });
    const { pageOperations } = await archivePage(page, [
      makeArchiveFolder(),
      makeInboxFolder(),
      makeProjectsFolder(),
      design,
    ]);

    await pageOperations.restore(page.id);

    await expect(pageOperations.restore(page.id)).rejects.toThrow(/not archived/);
  });

  it('throws for an unknown page id', async () => {
    const page = buildActivePage();
    const { pageOperations } = setup(page);

    await expect(pageOperations.restore('does-not-exist')).rejects.toThrow(/Page not found/);
  });
});
