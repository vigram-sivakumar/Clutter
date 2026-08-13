import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function buildActivePage(overrides?: {
  parentId?: string | null;
  path?: string;
}): Page {
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

function makeVault(
  pages: Page[],
  folders: Folder[] = [makeArchiveFolder()]
): Vault {
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

function buildPageOperations(
  vault: Vault,
  fileSystem: VaultFileSystem
): PageOperations {
  const moveService = new MoveService(vault, fileSystem);
  const coordinator = new PagePersistenceCoordinator(
    fileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService
  );
  const workspace = new Workspace();
  const folderOperations = new FolderOperations(
    vault,
    workspace,
    coordinator,
    new FolderPathResolver(vault),
    new FolderCreator(new UuidGenerator()),
    () => {},
    new DocumentRegistry(),
    new SaveCoordinator(),
    () => {}
  );

  return new PageOperations(
    vault,
    workspace,
    new DocumentRegistry(),
    new SaveCoordinator(),
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    folderOperations,
    new DailyNoteService(),
    () => {}
  );
}

function setup(page: Page, vault?: Vault) {
  const resolvedVault =
    vault ?? makeVault([page], [makeArchiveFolder(), makeInboxFolder()]);
  const fileSystem = new InMemoryVaultFileSystem();
  const serializer = new FrontmatterSerializer();
  fileSystem.seedFile(
    page.path,
    serializer.serializeDocument(page, page.source.markdown)
  );

  const pageOperations = buildPageOperations(resolvedVault, fileSystem);

  return { vault: resolvedVault, fileSystem, pageOperations, serializer };
}

async function archivePage(
  page: Page,
  folders: Folder[] = [makeArchiveFolder(), makeInboxFolder()]
) {
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
    expect(reloaded.source.markdown).toBe(
      'Content that must survive archiving.'
    );
    expect(reloaded.metadata.icon).toBe('📌');
  });

  // Collision handling (agreed design, see the Archive-destination-collision
  // ADR follow-up): archiving no longer throws when Archive/Note.md is
  // already occupied by a different page — it falls back to a local-time
  // timestamp suffix, computed by the same MoveService.resolveArchiveDestination
  // this facade already delegates to (MoveService.test.ts covers the naming
  // rule itself in isolation; this is the end-to-end PageOperations.archive()
  // path). This replaces the prior "throws when Archive/Note.md already
  // exists" expectation — that throw was the actual bug this change fixes,
  // not behavior to preserve.
  describe('collision at the Archive destination', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 12, 16, 43, 1)); // local time, 2026-08-12 16:43:01
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function seedOccupant(vault: Vault, fileSystem: InMemoryVaultFileSystem, path: string, id: string) {
      const occupant = new PageBuilder().build({
        parentId: ARCHIVE_FOLDER_ID,
        page: {
          path,
          directoryPath: `${ROOT}/Archive`,
          frontmatter: { id },
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

      vault.addPage(occupant);
      fileSystem.seedFile(
        occupant.path,
        new FrontmatterSerializer().serializeDocument(occupant, occupant.source.markdown)
      );

      return occupant;
    }

    it('archives to Archive/Note.md unchanged when the destination is free', async () => {
      const page = buildActivePage();
      const { vault, fileSystem, pageOperations } = setup(page);

      await pageOperations.archive(page.id);

      expect(fileSystem.hasFileSync(`${ROOT}/Archive/Note.md`)).toBe(true);
      expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/Archive/Note.md`);
    });

    it('falls back to a timestamp suffix instead of throwing when Archive/Note.md already exists', async () => {
      const page = buildActivePage();
      const vault = makeVault([page]);
      const fileSystem = new InMemoryVaultFileSystem();
      fileSystem.seedFile(
        page.path,
        new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
      );
      seedOccupant(vault, fileSystem, `${ROOT}/Archive/Note.md`, 'page-occupant');

      const pageOperations = buildPageOperations(vault, fileSystem);

      await pageOperations.archive(page.id);

      expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/Archive/Note 2026-08-12 16.43.01.md`);
      expect(fileSystem.hasFileSync(`${ROOT}/Archive/Note 2026-08-12 16.43.01.md`)).toBe(true);
      // The occupant that caused the collision is untouched.
      expect(fileSystem.hasFileSync(`${ROOT}/Archive/Note.md`)).toBe(true);
      // The logical name is unaffected — only the filesystem path carries
      // the disambiguating timestamp (rule 4: preserve the logical name).
      expect(vault.getPage(page.id)!.name).toBe('Note');
    });

    it('restoring a timestamp-suffixed archive returns to the original path, never derived from the archive filename', async () => {
      const design = makeDesignFolder();
      const page = buildActivePage({
        parentId: DESIGN_FOLDER_ID,
        path: `${ROOT}/Projects/Design/Note.md`,
      });
      const vault = makeVault([page], [makeArchiveFolder(), design]);
      const fileSystem = new InMemoryVaultFileSystem();
      fileSystem.seedFile(
        page.path,
        new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
      );
      seedOccupant(vault, fileSystem, `${ROOT}/Archive/Note.md`, 'page-occupant');

      const pageOperations = buildPageOperations(vault, fileSystem);

      await pageOperations.archive(page.id);
      expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/Archive/Note 2026-08-12 16.43.01.md`);

      await pageOperations.restore(page.id);

      const restored = vault.getPage(page.id)!;
      expect(restored.path).toBe(`${ROOT}/Projects/Design/Note.md`);
      expect(restored.metadata.status).toBe('active');
      expect(fileSystem.hasFileSync(`${ROOT}/Projects/Design/Note.md`)).toBe(true);
    });

    it('archives a Daily Note to Archive/<date>.md unchanged when free — the same rule, no type-specific branch', async () => {
      const dailyNotePath = `${ROOT}/Daily Notes/2026/August/2026-08-12.md`;
      const dailyNote = new PageBuilder(ROOT).build({
        parentId: null,
        page: {
          path: dailyNotePath,
          directoryPath: `${ROOT}/Daily Notes/2026/August`,
          frontmatter: { id: 'daily-note-1' },
          frontmatterAnalysis: { aliases: [] },
          content: 'Today.',
          analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
        },
      });
      expect(dailyNote.type).toBe('daily-note');

      const vault = makeVault([dailyNote]);
      const fileSystem = new InMemoryVaultFileSystem();
      fileSystem.seedFile(
        dailyNotePath,
        new FrontmatterSerializer().serializeDocument(dailyNote, dailyNote.source.markdown)
      );
      const pageOperations = buildPageOperations(vault, fileSystem);

      await pageOperations.archive(dailyNote.id);

      expect(vault.getPage(dailyNote.id)!.path).toBe(`${ROOT}/Archive/2026-08-12.md`);
    });

    it('only timestamps a Daily Note archive once Archive/<date>.md is already taken', async () => {
      const dailyNotePath = `${ROOT}/Daily Notes/2026/August/2026-08-12.md`;
      const dailyNote = new PageBuilder(ROOT).build({
        parentId: null,
        page: {
          path: dailyNotePath,
          directoryPath: `${ROOT}/Daily Notes/2026/August`,
          frontmatter: { id: 'daily-note-1' },
          frontmatterAnalysis: { aliases: [] },
          content: 'Today.',
          analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
        },
      });

      const vault = makeVault([dailyNote]);
      const fileSystem = new InMemoryVaultFileSystem();
      fileSystem.seedFile(
        dailyNotePath,
        new FrontmatterSerializer().serializeDocument(dailyNote, dailyNote.source.markdown)
      );
      // A prior day's daily note that already happens to occupy the exact
      // filename this one would flatten to (only realistic via a naming
      // edge case, but the rule must not special-case Daily Notes either
      // way — same fallback as any other type).
      seedOccupant(vault, fileSystem, `${ROOT}/Archive/2026-08-12.md`, 'other-day');

      const pageOperations = buildPageOperations(vault, fileSystem);

      await pageOperations.archive(dailyNote.id);

      expect(vault.getPage(dailyNote.id)!.path).toBe(
        `${ROOT}/Archive/2026-08-12 2026-08-12 16.43.01.md`
      );
    });
  });

  it('throws when the page is already archived', async () => {
    const page = buildActivePage();
    const { vault, fileSystem, pageOperations } = setup(page);

    await pageOperations.archive(page.id);

    await expect(pageOperations.archive(page.id)).rejects.toThrow(
      /already archived/
    );
    expect(fileSystem.hasFileSync(archivePathFor(page))).toBe(true);
    expect(vault.getPage(page.id)!.metadata.status).toBe('archived');
  });

  // Lazy system-folder lifecycle: Archive is no longer eagerly created at
  // startup, so a missing Archive folder is an ordinary state, not a
  // precondition failure — archiving recreates it (via
  // PagePersistenceCoordinator.ensureReservedFolderForOperation) and
  // succeeds, the same self-healing shape Daily Notes already has.
  it('recreates the Archive folder and archives successfully when it is missing from the vault', async () => {
    const page = buildActivePage();
    const vault = makeVault([page], []);
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );
    const pageOperations = buildPageOperations(vault, fileSystem);

    await pageOperations.archive(page.id);

    expect(vault.getReservedFolder('archive')).toBeDefined();
    expect(await fileSystem.exists(`${ROOT}/Archive`)).toBe(true);
    expect(await fileSystem.exists(`${ROOT}/Archive/.folder.md`)).toBe(false);
    expect(vault.getPage(page.id)!.metadata.status).toBe('archived');
  });

  it('throws for an unknown page id and does not write to disk', async () => {
    const page = buildActivePage();
    const { fileSystem, pageOperations } = setup(page);

    await expect(pageOperations.archive('does-not-exist')).rejects.toThrow(
      /Page not found/
    );
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
    expect(fileSystem.hasFileSync(`${ROOT}/Projects/Design/Note.md`)).toBe(
      true
    );
    expect(fileSystem.hasFileSync(archivePathFor(page))).toBe(false);
    expect(restored.source.markdown).toBe(
      'Content that must survive archiving.'
    );
  });

  // Restore is keyed on the exact stored originalPath string, not on
  // originalParentId — a renamed folder keeps its id but nothing exists at
  // the old path anymore, so this no longer follows the rename (the
  // approved trade-off: survive delete+recreate at the same path, not
  // survive a rename). No Inbox involved anywhere in this file: Inbox
  // still exists in the vault in every test below, and is never the
  // result.
  it('original folder was renamed while archived: old original path no longer exists, restores to vault root', async () => {
    const renamedDesign = makeDesignFolder(`${ROOT}/Projects/Product Design`);
    const archivedPage = buildArchivedPage({
      originalParentId: DESIGN_FOLDER_ID,
      originalPath: `${ROOT}/Projects/Design/Note.md`,
    });
    const vault = makeVault(
      [archivedPage],
      [
        makeArchiveFolder(),
        makeInboxFolder(),
        makeProjectsFolder(),
        renamedDesign,
      ]
    );
    const { fileSystem, pageOperations } = setup(archivedPage, vault);

    await pageOperations.restore(archivedPage.id);

    const restored = vault.getPage(archivedPage.id)!;
    expect(restored.path).toBe(`${ROOT}/Note.md`);
    expect(restored.parentId).toBeNull();
    expect(fileSystem.hasFileSync(`${ROOT}/Note.md`)).toBe(true);
  });

  it('original folder was deleted: restores directly at vault root, never Inbox', async () => {
    const archivedPage = buildArchivedPage({
      originalParentId: DESIGN_FOLDER_ID,
      originalPath: `${ROOT}/Projects/Design/Note.md`,
    });
    const vault = makeVault(
      [archivedPage],
      [makeArchiveFolder(), makeInboxFolder()]
    );
    const { fileSystem, pageOperations } = setup(archivedPage, vault);

    await pageOperations.restore(archivedPage.id);

    const restored = vault.getPage(archivedPage.id)!;
    expect(restored.path).toBe(`${ROOT}/Note.md`);
    expect(restored.parentId).toBeNull();
    expect(fileSystem.hasFileSync(`${ROOT}/Note.md`)).toBe(true);
    expect(fileSystem.hasFileSync(archivedPage.path)).toBe(false);
    // No Inbox involvement, even though Inbox exists in the vault.
    expect(fileSystem.hasFileSync(`${ROOT}/Inbox/Note.md`)).toBe(false);
  });

  it('original folder was deleted and a new folder was later created at the same original path: restores there, using the new folder id', async () => {
    const archivedPage = buildArchivedPage({
      originalParentId: DESIGN_FOLDER_ID,
      originalPath: `${ROOT}/Projects/Design/Note.md`,
    });
    // A brand-new folder, deliberately a different id than the original
    // DESIGN_FOLDER_ID, sitting at the exact original path.
    const recreatedDesign: Folder = {
      id: 'folder-design-recreated',
      name: 'Design',
      path: `${ROOT}/Projects/Design`,
      parentId: PROJECTS_FOLDER_ID,
      metadata: defaultFolderMetadata,
    };
    const vault = makeVault(
      [archivedPage],
      [
        makeArchiveFolder(),
        makeInboxFolder(),
        makeProjectsFolder(),
        recreatedDesign,
      ]
    );
    const { fileSystem, pageOperations } = setup(archivedPage, vault);

    await pageOperations.restore(archivedPage.id);

    const restored = vault.getPage(archivedPage.id)!;
    expect(restored.path).toBe(`${ROOT}/Projects/Design/Note.md`);
    expect(restored.parentId).toBe('folder-design-recreated');
    expect(restored.parentId).not.toBe(DESIGN_FOLDER_ID);
    expect(
      fileSystem.hasFileSync(`${ROOT}/Projects/Design/Note.md`)
    ).toBe(true);
  });

  // Regression: an externally/manually created archive can have
  // status: 'archived' with no originalPath at all — no app-initiated
  // archive ever produces this (computeArchiveMetadataPatch always sets
  // originalPath), so there is no reliable original filename to recover.
  // Per the agreed contract, restore goes straight to the vault root using
  // the current (possibly timestamped) filename — never Inbox, never
  // derived from originalParentId, and no new fallback mechanism.
  it('originalPath is null (malformed/external archive): restores to vault root using the current filename, never Inbox', async () => {
    const malformedArchive = new PageBuilder().build({
      parentId: ARCHIVE_FOLDER_ID,
      page: {
        path: `${ROOT}/Archive/Test 2026-08-12 16.43.01.md`,
        directoryPath: `${ROOT}/Archive`,
        frontmatter: {
          id: 'page-1',
          status: 'archived',
          // originalPath deliberately omitted -> resolvePageMetadata
          // defaults it to null.
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
    expect(malformedArchive.metadata.originalPath).toBeNull();

    const vault = makeVault([malformedArchive], [makeArchiveFolder(), makeInboxFolder()]);
    const { fileSystem, pageOperations } = setup(malformedArchive, vault);

    await pageOperations.restore(malformedArchive.id);

    const restored = vault.getPage(malformedArchive.id)!;
    expect(restored.path).toBe(`${ROOT}/Test 2026-08-12 16.43.01.md`);
    expect(restored.parentId).toBeNull();
    expect(restored.metadata.status).toBe('active');
    expect(fileSystem.hasFileSync(`${ROOT}/Test 2026-08-12 16.43.01.md`)).toBe(true);
    // Never Inbox, even though Inbox exists in the vault.
    expect(fileSystem.hasFileSync(`${ROOT}/Inbox/Test 2026-08-12 16.43.01.md`)).toBe(false);
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

    const folders = [
      makeArchiveFolder(),
      makeInboxFolder(),
      makeProjectsFolder(),
      design,
    ];
    const { vault, fileSystem, pageOperations, serializer } = await archivePage(
      page,
      folders
    );
    vault.addPage(occupant);
    fileSystem.seedFile(
      occupant.path,
      serializer.serializeDocument(occupant, occupant.source.markdown)
    );

    await expect(pageOperations.restore(page.id)).rejects.toThrow(
      /Path already in use/
    );
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
    expect(reloaded.source.markdown).toBe(
      'Content that must survive archiving.'
    );
    expect(reloaded.metadata.icon).toBe('📌');
  });

  it('throws when the page is not archived', async () => {
    const page = buildActivePage();
    const { fileSystem, pageOperations } = setup(page);

    await expect(pageOperations.restore(page.id)).rejects.toThrow(
      /not archived/
    );
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

    await expect(pageOperations.restore(page.id)).rejects.toThrow(
      /not archived/
    );
  });

  it('throws for an unknown page id', async () => {
    const page = buildActivePage();
    const { pageOperations } = setup(page);

    await expect(pageOperations.restore('does-not-exist')).rejects.toThrow(
      /Page not found/
    );
  });

  it('re-archiving a restored page works cleanly: fresh originalPath, no stale metadata, not tied to the previous archive path', async () => {
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
    expect(vault.getPage(page.id)!.path).toBe(`${ROOT}/Projects/Design/Note.md`);

    await pageOperations.archive(page.id);

    const reArchived = vault.getPage(page.id)!;
    // Not tied to the previous archive path — recomputed fresh, and free
    // (no collision, since the first archive's file already moved away).
    expect(reArchived.path).toBe(archivePathFor(page));
    expect(reArchived.metadata.status).toBe('archived');
    // originalPath reflects the most recent pre-archive location, not the
    // very first one — no stale data survives a restore/re-archive cycle.
    expect(reArchived.metadata.originalPath).toBe(`${ROOT}/Projects/Design/Note.md`);
    expect(fileSystem.hasFileSync(archivePathFor(page))).toBe(true);
  });
});
