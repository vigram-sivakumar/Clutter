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
  coverHidden: false,
  coverLayout: 'side' as const,
  coverPositionAbove: 50,
  coverPositionSide: 50,
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
  // A page with no recorded original location (it was put in Archive/ from outside Clutter — archived state is
  // location) is NOT silently sent anywhere: the restore asks for a destination, and nothing moves until one is given.
  const noProvenanceArchive = () =>
    new PageBuilder().build({
      parentId: ARCHIVE_FOLDER_ID,
      page: {
        path: `${ROOT}/Archive/Test 2026-08-12 16.43.01.md`,
        directoryPath: `${ROOT}/Archive`,
        // No status and no originalPath: just a file somebody dropped into Archive/.
        frontmatter: { id: 'page-1' },
        frontmatterAnalysis: { aliases: [] },
        content: 'Content that must survive restoring.',
        analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
      },
    });

  it('no recorded original location: restore asks for a destination, moves nothing, and invents no provenance', async () => {
    const dropped = noProvenanceArchive();
    expect(dropped.metadata.originalPath).toBeNull();
    const vault = makeVault([dropped], [makeArchiveFolder(), makeInboxFolder()]);
    const { fileSystem, pageOperations } = setup(dropped, vault);

    const outcome = await pageOperations.restore(dropped.id);

    expect(outcome).toEqual({ status: 'needs-destination' });
    const unchanged = vault.getPage(dropped.id)!;
    expect(unchanged.path).toBe(dropped.path);
    expect(unchanged.metadata.originalPath).toBeNull();
    expect(fileSystem.hasFileSync(dropped.path)).toBe(true);
  });

  it('with a chosen destination it restores there — the vault root, or a folder — keeping the current filename', async () => {
    const dropped = noProvenanceArchive();
    const vault = makeVault([dropped], [makeArchiveFolder(), makeInboxFolder()]);
    const { fileSystem, pageOperations } = setup(dropped, vault);

    const toRoot = await pageOperations.restore(dropped.id, { destinationFolderId: null });

    expect(toRoot).toEqual({ status: 'restored', movedToInbox: false });
    const restored = vault.getPage(dropped.id)!;
    expect(restored.path).toBe(`${ROOT}/Test 2026-08-12 16.43.01.md`);
    expect(restored.parentId).toBeNull();
    expect(restored.metadata.status).toBe('active');
    expect(restored.metadata.originalPath).toBeNull();
    expect(fileSystem.hasFileSync(`${ROOT}/Test 2026-08-12 16.43.01.md`)).toBe(true);
  });

  it('a chosen folder is honoured', async () => {
    const dropped = noProvenanceArchive();
    const vault = makeVault([dropped], [makeArchiveFolder(), makeInboxFolder()]);
    const { pageOperations } = setup(dropped, vault);

    await pageOperations.restore(dropped.id, { destinationFolderId: 'folder-inbox' });

    expect(vault.getPage(dropped.id)!.path).toBe(`${ROOT}/Inbox/Test 2026-08-12 16.43.01.md`);
  });

  it('an app-archived page (with provenance) still restores to its original place with no question asked', async () => {
    const page = buildActivePage({});
    const vault = makeVault([page], [makeArchiveFolder()]);
    const { pageOperations } = setup(page, vault);
    await pageOperations.archive(page.id);

    const outcome = await pageOperations.restore(page.id);

    expect(outcome).toEqual({ status: 'restored', movedToInbox: false });
    expect(vault.getPage(page.id)!.path).toBe(page.path);
  });

  it('reports a conflict (never overwrites) when the restore destination path is already occupied', async () => {
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

    // Nothing is overwritten and nothing throws: the occupied path comes back as a conflict the
    // caller can answer (see "restore conflicts" below).
    await expect(pageOperations.restore(page.id)).resolves.toEqual({
      status: 'conflict',
      existingPageId: 'page-occupant',
    });
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

// --- Daily Notes in the Trash, and restore conflicts (ADR-042) -----------------------------------

const DN_FOLDERS = {
  dailyNotes: { id: 'folder-daily-notes', name: 'Daily Notes', parentId: null },
  year: { id: 'folder-dn-2026', name: '2026', parentId: 'folder-daily-notes' },
  month: { id: 'folder-dn-october', name: 'October', parentId: 'folder-dn-2026' },
} as const;
const DN_PATH = `${ROOT}/Daily Notes/2026/October/2026-10-06.md`;

function dailyNoteFolders(): Folder[] {
  return [
    {
      ...DN_FOLDERS.dailyNotes,
      path: `${ROOT}/Daily Notes`,
      metadata: defaultFolderMetadata,
    },
    { ...DN_FOLDERS.year, path: `${ROOT}/Daily Notes/2026`, metadata: defaultFolderMetadata },
    {
      ...DN_FOLDERS.month,
      path: `${ROOT}/Daily Notes/2026/October`,
      metadata: defaultFolderMetadata,
    },
  ];
}

function buildPageAt(path: string, id: string, content: string): Page {
  return new PageBuilder(ROOT).build({
    parentId: null,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content,
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

function setupDailyNote(options: { extraPages?: Page[] } = {}) {
  const dailyNote = buildPageAt(DN_PATH, 'daily-1', 'Trashed day.');
  const vault = new Vault(
    ROOT,
    [dailyNote, ...(options.extraPages ?? [])],
    [makeArchiveFolder(), makeInboxFolder(), ...dailyNoteFolders()],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
  );
  const fileSystem = new InMemoryVaultFileSystem();
  const serializer = new FrontmatterSerializer();
  for (const page of [dailyNote, ...(options.extraPages ?? [])]) {
    fileSystem.seedFile(page.path, serializer.serializeDocument(page, page.source.markdown));
  }

  return { dailyNote, vault, fileSystem, serializer, pageOperations: buildPageOperations(vault, fileSystem) };
}

/** A new Daily Note for the same day, created while the first one sits in the Trash. */
function addSecondDailyNote(context: ReturnType<typeof setupDailyNote>): Page {
  const second = buildPageAt(DN_PATH, 'daily-2', 'Written later.');
  context.vault.addPage(second);
  context.fileSystem.seedFile(
    second.path,
    context.serializer.serializeDocument(second, second.source.markdown)
  );
  return second;
}

describe('A Daily Note in the Trash', () => {
  it('stays a Daily Note while archived, with its date and path-derived name intact', async () => {
    const { dailyNote, vault, pageOperations } = setupDailyNote();
    expect(dailyNote.type).toBe('daily-note');

    await pageOperations.archive(dailyNote.id);

    const trashed = vault.getPage(dailyNote.id)!;
    expect(trashed.path).toBe(`${ROOT}/Archive/2026-10-06.md`);
    expect(trashed.type).toBe('daily-note');
    expect(trashed.name).toBe('2026-10-06');
    expect(trashed.metadata.originalPath).toBe(DN_PATH);
  });

  it('is still a Daily Note after a reload from disk (the type is rebuilt from path + originalPath)', async () => {
    const { dailyNote, vault, fileSystem, pageOperations } = setupDailyNote();
    await pageOperations.archive(dailyNote.id);

    const document = await fileSystem.readFile(`${ROOT}/Archive/2026-10-06.md`);
    const parsed = new FrontmatterParser().parse(document);
    const rebuilt = new PageBuilder(ROOT).build({
      parentId: ARCHIVE_FOLDER_ID,
      page: {
        path: `${ROOT}/Archive/2026-10-06.md`,
        directoryPath: `${ROOT}/Archive`,
        frontmatter: parsed.frontmatter,
        frontmatterAnalysis: parsed.frontmatterAnalysis,
        content: parsed.body,
        analysis: parsed.analysis,
      },
    });

    expect(vault.getPage(dailyNote.id)!.type).toBe('daily-note');
    expect(rebuilt.type).toBe('daily-note');
  });

  it('a regular note in the Trash is still a note', async () => {
    const note = buildPageAt(`${ROOT}/Idea.md`, 'note-1', 'x');
    const context = setupDailyNote({ extraPages: [note] });

    await context.pageOperations.archive(note.id);

    expect(context.vault.getPage(note.id)!.type).toBe('note');
  });

  it('restoring to a free original path returns it to Daily Notes, same title/date, nothing renamed', async () => {
    const { dailyNote, vault, pageOperations } = setupDailyNote();
    await pageOperations.archive(dailyNote.id);

    const outcome = await pageOperations.restore(dailyNote.id);

    const restored = vault.getPage(dailyNote.id)!;
    expect(outcome).toEqual({ status: 'restored', movedToInbox: false });
    expect(restored.path).toBe(DN_PATH);
    expect(restored.type).toBe('daily-note');
    expect(restored.name).toBe('2026-10-06');
    expect(restored.metadata.originalPath).toBeNull();
    expect(restored.source.markdown).toBe('Trashed day.');
  });
});

describe('Daily Note restore conflicts', () => {
  async function trashedWithNewerDailyNote() {
    const context = setupDailyNote();
    await context.pageOperations.archive(context.dailyNote.id);
    const second = addSecondDailyNote(context);
    return { ...context, second };
  }

  it('reports the conflict and changes nothing when no answer is given', async () => {
    const { dailyNote, second, vault, fileSystem, pageOperations } = await trashedWithNewerDailyNote();

    await expect(pageOperations.restore(dailyNote.id)).resolves.toEqual({
      status: 'conflict',
      existingPageId: second.id,
    });

    expect(vault.getPage(dailyNote.id)!.path).toBe(`${ROOT}/Archive/2026-10-06.md`);
    expect(vault.getPage(dailyNote.id)!.metadata.status).toBe('archived');
    expect(vault.getPage(second.id)!.source.markdown).toBe('Written later.');
    expect(await fileSystem.readFile(DN_PATH)).toContain('Written later.');
  });

  it("'inbox' restores it into the Inbox as an ordinary note and leaves the existing Daily Note untouched", async () => {
    const { dailyNote, second, vault, fileSystem, pageOperations } = await trashedWithNewerDailyNote();
    const existingBefore = await fileSystem.readFile(DN_PATH);

    const outcome = await pageOperations.restore(dailyNote.id, { onConflict: 'inbox' });

    const restored = vault.getPage(dailyNote.id)!;
    expect(outcome).toEqual({ status: 'restored', movedToInbox: true });
    expect(restored.path).toBe(`${ROOT}/Inbox/2026-10-06.md`);
    expect(restored.parentId).toBe(INBOX_FOLDER_ID);
    expect(restored.type).toBe('note');
    expect(restored.metadata.status).toBe('active');
    expect(restored.metadata.originalPath).toBeNull();
    expect(restored.source.markdown).toBe('Trashed day.');

    expect(vault.getPage(second.id)!.path).toBe(DN_PATH);
    expect(vault.getPage(second.id)!.type).toBe('daily-note');
    expect(await fileSystem.readFile(DN_PATH)).toBe(existingBefore);
  });

  it('an Inbox note with the same filename is never overwritten — the restored note gets a free name', async () => {
    const inboxNote = buildPageAt(`${ROOT}/Inbox/2026-10-06.md`, 'inbox-1', 'Already in Inbox.');
    const context = setupDailyNote({ extraPages: [inboxNote] });
    await context.pageOperations.archive(context.dailyNote.id);
    addSecondDailyNote(context);

    await context.pageOperations.restore(context.dailyNote.id, { onConflict: 'inbox' });

    const restored = context.vault.getPage(context.dailyNote.id)!;
    expect(restored.path).not.toBe(inboxNote.path);
    expect(restored.path.startsWith(`${ROOT}/Inbox/`)).toBe(true);
    expect(context.vault.getPage(inboxNote.id)!.path).toBe(`${ROOT}/Inbox/2026-10-06.md`);
    expect(context.vault.getPage(inboxNote.id)!.source.markdown).toBe('Already in Inbox.');
    expect(await context.fileSystem.readFile(inboxNote.path)).toContain('Already in Inbox.');
  });

  it("'replace' permanently deletes the existing Daily Note and restores into its place", async () => {
    const { dailyNote, second, vault, fileSystem, pageOperations } = await trashedWithNewerDailyNote();

    const outcome = await pageOperations.restore(dailyNote.id, { onConflict: 'replace' });

    expect(outcome).toEqual({ status: 'restored', movedToInbox: false });
    expect(vault.getPage(second.id)).toBeUndefined();
    const restored = vault.getPage(dailyNote.id)!;
    expect(restored.path).toBe(DN_PATH);
    expect(restored.type).toBe('daily-note');
    expect(await fileSystem.readFile(DN_PATH)).toContain('Trashed day.');
  });

  it('a normal (non-conflicting) note restore is unchanged and never touches the Inbox', async () => {
    const note = buildPageAt(`${ROOT}/Idea.md`, 'note-1', 'x');
    const context = setupDailyNote({ extraPages: [note] });
    await context.pageOperations.archive(note.id);

    const outcome = await context.pageOperations.restore(note.id, { onConflict: 'inbox' });

    expect(outcome).toEqual({ status: 'restored', movedToInbox: false });
    expect(context.vault.getPage(note.id)!.path).toBe(`${ROOT}/Idea.md`);
  });
});
