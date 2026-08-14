import { describe, expect, it, vi } from 'vitest';
import { PageOperations } from './PageOperations';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { DocumentState } from '../../engine/DocumentState';
import { DocumentTransaction } from '../../engine/DocumentTransaction';
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
import type { Page } from '../../vault/models/Page';
import type { Folder } from '../../vault/models/Folder';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

function makeFolderOperations(
  vault: Vault,
  workspace: Workspace,
  coordinator: PagePersistenceCoordinator
): FolderOperations {
  return new FolderOperations(
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
}

const ROOT = '/vault';
const ARCHIVE_FOLDER_ID = 'folder-archive';

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

function makeDailyNotesFolder(): Folder {
  return {
    id: 'folder-daily-notes',
    name: 'Daily Notes',
    path: `${ROOT}/Daily Notes`,
    parentId: null,
    metadata: defaultFolderMetadata,
  };
}

function archivePathFor(page: Page): string {
  const filename = page.path.slice(page.path.lastIndexOf('/') + 1);
  return `${ROOT}/Archive/${filename}`;
}

function buildPage(
  overrides: { icon?: string; favorite?: boolean } = {}
): Page {
  const builder = new PageBuilder();
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/Note.md`,
      directoryPath: ROOT,
      frontmatter: {
        id: 'page-1',
        icon: overrides.icon,
        favorite: overrides.favorite,
      },
      frontmatterAnalysis: { aliases: [] },
      content: 'Original body',
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

function buildNamedPage(id: string, path: string): Page {
  const builder = new PageBuilder();
  return builder.build({
    parentId: null,
    page: {
      path,
      directoryPath: ROOT,
      frontmatter: { id },
      frontmatterAnalysis: { aliases: [] },
      content: 'Original body',
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

function setup(
  page: Page,
  fileSystem?: VaultFileSystem,
  folders?: Folder[],
  openFallbackPage: () => void = () => {}
) {
  const vault = makeVault([page], folders ?? [makeArchiveFolder()]);
  const resolvedFileSystem = fileSystem ?? new InMemoryVaultFileSystem();

  if (resolvedFileSystem instanceof InMemoryVaultFileSystem) {
    resolvedFileSystem.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );
  }

  const workspace = new Workspace();
  const documentRegistry = new DocumentRegistry();
  const saveCoordinator = new SaveCoordinator();
  const moveService = new MoveService(vault, resolvedFileSystem);
  const coordinator = new PagePersistenceCoordinator(
    resolvedFileSystem,
    vault,
    new FrontmatterSerializer(),
    new FrontmatterParser(),
    new PageRebuilder(),
    moveService
  );
  const pageOperations = new PageOperations(
    vault,
    workspace,
    documentRegistry,
    saveCoordinator,
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    makeFolderOperations(vault, workspace, coordinator),
    new DailyNoteService(),
    openFallbackPage
  );

  return {
    vault,
    fileSystem: resolvedFileSystem,
    workspace,
    documentRegistry,
    coordinator,
    pageOperations,
  };
}

/**
 * Archives a page by enqueueing directly through the coordinator a test's
 * `setup()` already built — bypassing PageOperations.archive() (added in
 * commit 3) since this test file only covers open/close/getSession/save
 * (commit 2's scope).
 */
async function archiveDirectly(
  coordinator: PagePersistenceCoordinator,
  pageId: string
) {
  await coordinator.enqueue(pageId, { kind: 'archive' });
}

describe('PageOperations: open / close / getSession', () => {
  it('open registers a session and marks the page open in the workspace', async () => {
    const page = buildPage();
    const { workspace, documentRegistry, pageOperations } = setup(page);

    await pageOperations.open(page.id);

    expect(documentRegistry.get(page.id)).toBeDefined();
    expect(workspace.isPageOpen(page.id)).toBe(true);
  });

  it('open throws for an unknown page id', async () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    await expect(pageOperations.open('does-not-exist')).rejects.toThrow(
      /Page not found/
    );
  });

  it('getSession returns undefined when no session is open', () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    expect(pageOperations.getSession(page.id)).toBeUndefined();
  });

  it('close removes the session and the workspace entry', async () => {
    const page = buildPage();
    const { workspace, documentRegistry, pageOperations } = setup(page);

    await pageOperations.open(page.id);
    pageOperations.close(page.id);

    expect(documentRegistry.get(page.id)).toBeUndefined();
    expect(workspace.isPageOpen(page.id)).toBe(false);
  });
});

describe('PageOperations.save(): archived pages are view-only', () => {
  it('an archived page can still be opened', async () => {
    const page = buildPage();
    const { documentRegistry, coordinator, pageOperations } = setup(page);

    await archiveDirectly(coordinator, page.id);

    await expect(pageOperations.open(page.id)).resolves.toBeUndefined();
    expect(documentRegistry.get(page.id)?.id).toBe(page.id);
  });

  it('save() rejects for an archived page and never touches the session or disk', async () => {
    const page = buildPage();
    const { vault, fileSystem, coordinator, pageOperations } = setup(page);
    await archiveDirectly(coordinator, page.id);

    await pageOperations.open(page.id);
    const session = pageOperations.getSession(page.id)!;
    const revisionBefore = session.currentRevision;
    const archivePath = archivePathFor(page);
    const diskBefore = await fileSystem.readFile(archivePath);

    await expect(
      pageOperations.save(page.id, 'Attempted edit')
    ).rejects.toThrow(/Cannot edit archived page/);

    expect(session.currentRevision).toBe(revisionBefore);
    expect(session.state).not.toBe(DocumentState.Saving);
    expect(vault.getPage(page.id)!.source.markdown).toBe('Original body');
    expect(await fileSystem.readFile(archivePath)).toBe(diskBefore);
  });

  it('a page archived after its session was already open is still rejected on the next edit', async () => {
    const page = buildPage();
    const { coordinator, pageOperations } = setup(page);

    await pageOperations.open(page.id);
    await expect(
      pageOperations.save(page.id, 'Edit while active')
    ).resolves.toBeUndefined();
    expect(pageOperations.getSession(page.id)!.currentRevision.markdown).toBe(
      'Edit while active'
    );

    await archiveDirectly(coordinator, page.id);

    await expect(
      pageOperations.save(page.id, 'Edit after archiving')
    ).rejects.toThrow(/Cannot edit archived page/);
  });

  it('once a page is restored to active status, edits are allowed again', async () => {
    const page = buildPage();
    const { vault, pageOperations } = setup(page);

    await pageOperations.open(page.id);
    const archived = {
      ...page,
      metadata: { ...page.metadata, status: 'archived' as const },
    };
    vault.replacePage(archived);

    await expect(pageOperations.save(page.id, 'Blocked')).rejects.toThrow();

    vault.replacePage({
      ...vault.getPage(page.id)!,
      metadata: {
        ...vault.getPage(page.id)!.metadata,
        status: 'active',
        archivedAt: null,
      },
    });

    await expect(
      pageOperations.save(page.id, 'Edit after restore')
    ).resolves.toBeUndefined();
    expect(vault.getPage(page.id)!.source.markdown).toBe('Edit after restore');
  });
});

describe('PageOperations.updateMetadata()', () => {
  it('persists a metadata patch to disk and the vault, without requiring an open session', async () => {
    const page = buildPage();
    const { vault, fileSystem, pageOperations } = setup(page);

    await pageOperations.updateMetadata(page.id, {
      description: 'A new description',
    });

    expect(vault.getPage(page.id)!.metadata.description).toBe(
      'A new description'
    );
    expect(await fileSystem.readFile(page.path)).toContain(
      'description: A new description'
    );
  });

  it('preserves unrelated metadata (icon, favorite) across a metadata-only patch', async () => {
    const page = buildPage({ icon: '📝', favorite: true });
    const { vault, pageOperations } = setup(page);

    await pageOperations.updateMetadata(page.id, {
      description: 'A new description',
    });

    const updated = vault.getPage(page.id)!;
    expect(updated.metadata.icon).toBe('📝');
    expect(updated.metadata.favorite).toBe(true);
  });

  it("writes the vault's current durable body, leaving a dirty open session untouched", async () => {
    const page = buildPage();
    const { vault, pageOperations } = setup(page);

    await pageOperations.open(page.id);
    const session = pageOperations.getSession(page.id)!;
    session.commit(new DocumentTransaction('Unsaved editor content'));

    await pageOperations.updateMetadata(page.id, {
      description: 'A new description',
    });

    expect(vault.getPage(page.id)!.source.markdown).toBe('Original body');
    expect(session.currentRevision.markdown).toBe('Unsaved editor content');
    expect(session.isDirty).toBe(true);
  });

  it('rejects for an archived page', async () => {
    const page = buildPage();
    const { coordinator, pageOperations } = setup(page);
    await archiveDirectly(coordinator, page.id);

    await expect(
      pageOperations.updateMetadata(page.id, { description: 'Blocked' })
    ).rejects.toThrow(/Cannot edit archived page/);
  });

  it('rejects for an unknown page id', async () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    await expect(
      pageOperations.updateMetadata('does-not-exist', { description: 'x' })
    ).rejects.toThrow(/Page not found/);
  });
});

describe('PageOperations.save(): round-trip and failure behavior', () => {
  it('preserves the page id and updates the markdown body on disk and in the vault', async () => {
    const page = buildPage();
    const { vault, fileSystem, pageOperations } = setup(page);

    await pageOperations.open(page.id);
    await pageOperations.save(page.id, 'Edited body');

    expect(await fileSystem.readFile(page.path)).toContain('Edited body');
    const updated = vault.getPage(page.id);
    expect(updated!.id).toBe(page.id);
    expect(updated!.source.markdown).toBe('Edited body');
  });

  it('preserves unrelated metadata (icon, favorite) across a content-only save', async () => {
    const page = buildPage({ icon: '📝', favorite: true });
    const { vault, pageOperations } = setup(page);

    await pageOperations.open(page.id);
    await pageOperations.save(page.id, 'New content');

    const updated = vault.getPage(page.id)!;
    expect(updated.metadata.icon).toBe('📝');
    expect(updated.metadata.favorite).toBe(true);
  });

  it('re-derives analysis (tags/tasks) from the newly saved markdown', async () => {
    const page = buildPage();
    const { vault, pageOperations } = setup(page);

    await pageOperations.open(page.id);
    await pageOperations.save(page.id, 'New body #project\n- [ ] follow up');

    const updated = vault.getPage(page.id)!;
    expect(updated.analysis.tags.map((t) => t.name)).toContain('project');
    expect(updated.analysis.tasks).toHaveLength(1);
    expect(Array.from(vault.tags()).map((t) => t.name)).toContain('project');
  });

  it('marks the session saved and clean after a successful save', async () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    await pageOperations.open(page.id);
    await pageOperations.save(page.id, 'New content');

    const session = pageOperations.getSession(page.id)!;
    expect(session.state).toBe(DocumentState.Clean);
    expect(session.isDirty).toBe(false);
  });

  // Note: the pre-consolidation PersistenceService.save(session, revision)
  // took an externally-supplied revision, so a caller could pass a stale
  // one — exercised by a dedicated "no-op when the supplied revision is
  // stale" test. PageOperations.save(pageId, markdown) commits and captures
  // its own revision internally; there is no longer a seam for a caller to
  // supply a stale revision at all, so that scenario is not merely
  // untested, it's structurally unreachable now. This is a strengthening
  // (impossible by construction beats guarded-at-runtime), not a coverage
  // loss — recorded in ADR-012.

  it('rejects immediately, before any write, when the page no longer exists when save() is called', async () => {
    // This is a strictly earlier-firing guard than the Gate's own
    // replacePage-after-write abandon path (see the "removed while the
    // write is in flight" test below) — save()'s own vault existence check
    // (inherited from PageApplicationService.updateMarkdown) catches this
    // case before ever committing a transaction or reaching the Gate.
    const page = buildPage();
    const { vault, fileSystem, pageOperations } = setup(page);
    const diskBefore = await fileSystem.readFile(page.path);

    await pageOperations.open(page.id);
    vault.removePage(page.id);

    await expect(pageOperations.save(page.id, 'New content')).rejects.toThrow(
      /Page not found/
    );

    expect(await fileSystem.readFile(page.path)).toBe(diskBefore);
  });

  it('propagates writeFile failures, marks the session SaveError, and does not touch the vault', async () => {
    const page = buildPage();
    const { vault, fileSystem, pageOperations } = setup(page);
    fileSystem.writeFile = async () => {
      throw new Error('disk full');
    };

    await pageOperations.open(page.id);

    await expect(pageOperations.save(page.id, 'New content')).rejects.toThrow(
      'disk full'
    );

    expect(pageOperations.getSession(page.id)!.state).toBe(
      DocumentState.SaveError
    );
    expect(vault.getPage(page.id)!.source.markdown).toBe('Original body');
  });

  it('resolves cleanly, without an uncaught rejection, when the page is removed while the write is in flight', async () => {
    // Removal must happen mid-write, not before save() is even called —
    // save()'s own up-front existence check (inherited from
    // PageApplicationService.updateMarkdown) would otherwise reject with
    // "Page not found" before ever reaching the Gate at all, which is a
    // different, earlier-firing guard than the one this test targets: the
    // Gate's own replacePage-after-write abandon path, for a page that
    // vanishes only after its save was already queued and its write
    // already started. In that window the write itself still lands on disk
    // (at-least-once write semantics — the same tradeoff already accepted
    // for the Gate's `create` kind, see ADR-011); what must not happen is
    // an uncaught rejection or a Vault left out of sync with what's on
    // disk, and the session must end up reflecting the failure.
    const page = buildPage();
    const { vault, fileSystem, pageOperations } = setup(page);
    let releaseWrite!: () => void;
    const originalWriteFile = fileSystem.writeFile.bind(fileSystem);
    fileSystem.writeFile = async (path: string, contents: string) => {
      await new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      return originalWriteFile(path, contents);
    };

    await pageOperations.open(page.id);
    const savePromise = pageOperations.save(page.id, 'New content');

    await vi.waitFor(() => expect(releaseWrite).toBeDefined());
    vault.removePage(page.id);
    releaseWrite();

    await expect(savePromise).resolves.toBeUndefined();

    expect(pageOperations.getSession(page.id)!.state).toBe(
      DocumentState.SaveError
    );
    expect(vault.getPage(page.id)).toBeUndefined();
    expect(await fileSystem.readFile(page.path)).toContain('New content');
  });
});

describe('PageOperations.save(): concurrent saves on the same page', () => {
  it('two overlapping saves for the same page resolve in call order, vault reflects the last write', async () => {
    const page = buildPage();
    const { vault, pageOperations } = setup(page);

    await pageOperations.open(page.id);

    const saveA = pageOperations.save(page.id, 'Revision A');
    const saveB = pageOperations.save(page.id, 'Revision B');

    await Promise.all([saveA, saveB]);

    const session = pageOperations.getSession(page.id)!;
    expect(vault.getPage(page.id)!.source.markdown).toBe('Revision B');
    expect(session.isDirty).toBe(false);
    expect(session.savedRevision.markdown).toBe('Revision B');
  });

  it('a stale completion does not mark the session saved with an old revision', async () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    await pageOperations.open(page.id);

    const saveA = pageOperations.save(page.id, 'Revision A');
    const saveB = pageOperations.save(page.id, 'Revision B');
    await Promise.all([saveA, saveB]);

    const session = pageOperations.getSession(page.id)!;
    expect(session.savedRevision.markdown).toBe('Revision B');
    expect(session.savedRevision.markdown).not.toBe('Revision A');
  });
});

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

describe('PageOperations.create()', () => {
  it('creates the page, writes it to disk, and opens it in the workspace', async () => {
    const existing = buildPage();
    const { vault, fileSystem, workspace, pageOperations } = setup(existing);

    const newId = await pageOperations.create({
      folderId: null,
      title: 'Idea',
    });

    expect(
      (fileSystem as InMemoryVaultFileSystem).hasFileSync(`${ROOT}/Idea.md`)
    ).toBe(true);
    const created = vault.getPage(newId);
    expect(created).toBeDefined();
    expect(created!.path).toBe(`${ROOT}/Idea.md`);
    expect(workspace.isPageOpen(newId)).toBe(true);
  });

  it('creates the page inside the given folder', async () => {
    const existing = buildPage();
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, pageOperations } = setup(existing, undefined, [
      makeArchiveFolder(),
      folder,
    ]);

    const newId = await pageOperations.create({
      folderId: 'folder-1',
      title: 'Roadmap',
    });

    const created = vault.getPage(newId)!;
    expect(created.path).toBe(`${ROOT}/Projects/Roadmap.md`);
    expect(created.parentId).toBe('folder-1');
  });

  it('throws for an unknown destination folder', async () => {
    const existing = buildPage();
    const { pageOperations } = setup(existing);

    await expect(
      pageOperations.create({ folderId: 'does-not-exist', title: 'Idea' })
    ).rejects.toThrow(/Folder not found/);
  });

  it('picks the next free numbered name when the title collides', async () => {
    const existing = buildPage();
    const { vault, fileSystem, pageOperations } = setup(existing);
    (fileSystem as InMemoryVaultFileSystem).seedFile(
      `${ROOT}/Idea.md`,
      '---\nid: page-occupant\n---\nAlready here'
    );
    vault.addPage(
      new PageBuilder().build({
        parentId: null,
        page: {
          path: `${ROOT}/Idea.md`,
          directoryPath: ROOT,
          frontmatter: { id: 'page-occupant' },
          frontmatterAnalysis: { aliases: [] },
          content: 'Already here',
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

    const newId = await pageOperations.create({
      folderId: null,
      title: 'Idea',
    });

    expect(vault.getPage(newId)!.path).toBe(`${ROOT}/Idea 2.md`);
  });

  it('the created page id in the Vault matches the id PageCreator generated', async () => {
    const existing = buildPage();
    const { vault, pageOperations } = setup(existing);

    const newId = await pageOperations.create({
      folderId: null,
      title: 'Idea',
    });

    const created = vault.getPage(newId)!;
    expect(created.id).toBe(newId);
  });
});

describe('PageOperations.delete()', () => {
  it('closes the session, deletes the file, and closes the workspace entry', async () => {
    const page = buildPage();
    const { vault, fileSystem, workspace, documentRegistry, pageOperations } =
      setup(page);

    await pageOperations.open(page.id);
    expect(documentRegistry.get(page.id)).toBeDefined();

    await pageOperations.delete(page.id);

    expect(documentRegistry.get(page.id)).toBeUndefined();
    expect(workspace.isPageOpen(page.id)).toBe(false);
    expect((fileSystem as InMemoryVaultFileSystem).hasFileSync(page.path)).toBe(
      false
    );
    expect(vault.getPage(page.id)).toBeUndefined();
  });

  it('closes the session before enqueueing the disk delete', async () => {
    const page = buildPage();
    const { documentRegistry, coordinator, pageOperations } = setup(page);
    await pageOperations.open(page.id);

    const closeSpy = vi.spyOn(documentRegistry, 'close');
    const enqueueSpy = vi.spyOn(coordinator, 'enqueue');

    await pageOperations.delete(page.id);

    expect(closeSpy).toHaveBeenCalledWith(page.id);
    expect(enqueueSpy).toHaveBeenCalledWith(page.id, { kind: 'delete' });
    const closeOrder = closeSpy.mock.invocationCallOrder[0]!;
    const enqueueOrder = enqueueSpy.mock.invocationCallOrder[0]!;
    expect(closeOrder).toBeLessThan(enqueueOrder);
  });

  it('resolves without throwing for an unknown page id and touches no disk (ADR-017: delete has no existence check, matching a never-persisted draft)', async () => {
    const page = buildPage();
    const { fileSystem, pageOperations } = setup(page);

    await expect(
      pageOperations.delete('does-not-exist')
    ).resolves.toBeUndefined();
    expect((fileSystem as InMemoryVaultFileSystem).hasFileSync(page.path)).toBe(
      true
    );
  });

  // ADR-025: deleting the active page must never leave the app without a
  // valid page — either a previously-open page is restored (Workspace's
  // own job), or PageOperations asks the Composition Root to open its
  // fallback page. delete() never knows what that fallback page is.
  describe('fallback-page navigation (ADR-025)', () => {
    it('opens the fallback page when deleting the only open (active) page', async () => {
      const page = buildPage();
      const openFallbackPage = vi.fn();
      const { workspace, pageOperations } = setup(
        page,
        undefined,
        undefined,
        openFallbackPage
      );

      await pageOperations.open(page.id);
      expect(workspace.activePageId).toBe(page.id);

      await pageOperations.delete(page.id);

      expect(workspace.activeView).toBeNull();
      expect(openFallbackPage).toHaveBeenCalledTimes(1);
    });

    it('restores the previously-open page instead of opening the fallback page', async () => {
      const activePage = buildNamedPage('page-active', `${ROOT}/Active.md`);
      const previousPage = buildNamedPage(
        'page-previous',
        `${ROOT}/Previous.md`
      );
      const openFallbackPage = vi.fn();
      const vault = makeVault([activePage, previousPage]);
      const fileSystem = new InMemoryVaultFileSystem();
      fileSystem.seedFile(
        activePage.path,
        new FrontmatterSerializer().serializeDocument(
          activePage,
          activePage.source.markdown
        )
      );
      fileSystem.seedFile(
        previousPage.path,
        new FrontmatterSerializer().serializeDocument(
          previousPage,
          previousPage.source.markdown
        )
      );
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
      const pageOperations = new PageOperations(
        vault,
        workspace,
        documentRegistry,
        saveCoordinator,
        coordinator,
        new PagePathResolver(vault),
        new PageCreator(new UuidGenerator(), new PageFactory()),
        makeFolderOperations(vault, workspace, coordinator),
        new DailyNoteService(),
        openFallbackPage
      );

      // Both open, in order, so previousPage is the workspace's next
      // fallback once activePage closes.
      await pageOperations.open(previousPage.id);
      await pageOperations.open(activePage.id);
      expect(workspace.activePageId).toBe(activePage.id);

      await pageOperations.delete(activePage.id);

      expect(workspace.activePageId).toBe(previousPage.id);
      expect(openFallbackPage).not.toHaveBeenCalled();
    });

    it('does not open the fallback page when deleting a page that is not the active one', async () => {
      const activePage = buildNamedPage('page-active', `${ROOT}/Active.md`);
      const backgroundPage = buildNamedPage(
        'page-background',
        `${ROOT}/Background.md`
      );
      const openFallbackPage = vi.fn();
      const vault = makeVault([activePage, backgroundPage]);
      const fileSystem = new InMemoryVaultFileSystem();
      fileSystem.seedFile(
        activePage.path,
        new FrontmatterSerializer().serializeDocument(
          activePage,
          activePage.source.markdown
        )
      );
      fileSystem.seedFile(
        backgroundPage.path,
        new FrontmatterSerializer().serializeDocument(
          backgroundPage,
          backgroundPage.source.markdown
        )
      );
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
      const pageOperations = new PageOperations(
        vault,
        workspace,
        documentRegistry,
        saveCoordinator,
        coordinator,
        new PagePathResolver(vault),
        new PageCreator(new UuidGenerator(), new PageFactory()),
        makeFolderOperations(vault, workspace, coordinator),
        new DailyNoteService(),
        openFallbackPage
      );

      await pageOperations.open(backgroundPage.id);
      await pageOperations.open(activePage.id);

      await pageOperations.delete(backgroundPage.id);

      expect(workspace.activePageId).toBe(activePage.id);
      expect(openFallbackPage).not.toHaveBeenCalled();
    });

    it('opens the fallback page when deleting an unpersisted draft that was the only open page', async () => {
      const page = buildPage();
      const openFallbackPage = vi.fn();
      const { workspace, pageOperations } = setup(
        page,
        undefined,
        undefined,
        openFallbackPage
      );

      const draftId = await pageOperations.openDraft({ folderId: null });
      expect(workspace.activePageId).toBe(draftId);

      await pageOperations.delete(draftId);

      expect(workspace.activeView).toBeNull();
      expect(openFallbackPage).toHaveBeenCalledTimes(1);
    });
  });
});

// Archive ≠ Delete: archive is a soft-delete — the page still exists, only
// relocated into Archive/ and restatused. It must never touch Workspace,
// whether or not the archived page is the active one. Workspace tracks the
// active view by page id, and the Gate's `archive` dispatch updates that
// same page in Vault in place, so an open active page simply keeps
// rendering itself at its new Archive/ location — no close, no fallback.
describe('PageOperations.archive() navigation (Archive ≠ Delete)', () => {
  it('keeps the active page open after archiving it', async () => {
    const page = buildPage();
    const openFallbackPage = vi.fn();
    const { workspace, vault, pageOperations } = setup(
      page,
      undefined,
      undefined,
      openFallbackPage
    );

    await pageOperations.open(page.id);
    expect(workspace.activePageId).toBe(page.id);

    await pageOperations.archive(page.id);

    expect(workspace.activePageId).toBe(page.id);
    expect(workspace.isPageOpen(page.id)).toBe(true);
    expect(openFallbackPage).not.toHaveBeenCalled();
    expect(vault.getPage(page.id)!.metadata.status).toBe('archived');
  });

  it('does not navigate at all when archiving a page that is not the active one — the soft-archive/non-active case', async () => {
    const activePage = buildNamedPage('page-active', `${ROOT}/Active.md`);
    const backgroundPage = buildNamedPage(
      'page-background',
      `${ROOT}/Background.md`
    );
    const openFallbackPage = vi.fn();
    const vault = makeVault([activePage, backgroundPage]);
    const fileSystem = new InMemoryVaultFileSystem();
    fileSystem.seedFile(
      activePage.path,
      new FrontmatterSerializer().serializeDocument(
        activePage,
        activePage.source.markdown
      )
    );
    fileSystem.seedFile(
      backgroundPage.path,
      new FrontmatterSerializer().serializeDocument(
        backgroundPage,
        backgroundPage.source.markdown
      )
    );
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
    const pageOperations = new PageOperations(
      vault,
      workspace,
      documentRegistry,
      saveCoordinator,
      coordinator,
      new PagePathResolver(vault),
      new PageCreator(new UuidGenerator(), new PageFactory()),
      makeFolderOperations(vault, workspace, coordinator),
      new DailyNoteService(),
      openFallbackPage
    );

    await pageOperations.open(backgroundPage.id);
    await pageOperations.open(activePage.id);

    await pageOperations.archive(backgroundPage.id);

    // The still-active page is untouched, the background page stays open
    // (its tab is not force-closed — archive is soft, unlike delete) and
    // no fallback is ever consulted.
    expect(workspace.activePageId).toBe(activePage.id);
    expect(workspace.isPageOpen(backgroundPage.id)).toBe(true);
    expect(openFallbackPage).not.toHaveBeenCalled();
  });

  it('archiving a page that is not open at all triggers no navigation', async () => {
    const page = buildPage();
    const openFallbackPage = vi.fn();
    const { workspace, pageOperations } = setup(
      page,
      undefined,
      undefined,
      openFallbackPage
    );

    await pageOperations.archive(page.id);

    expect(workspace.activeView).toBeNull();
    expect(openFallbackPage).not.toHaveBeenCalled();
  });
});

describe('PageOperations: create/save concurrency', () => {
  it('create immediately followed by save on the same freshly-created id applies both writes in order', async () => {
    const existing = buildPage();
    const { vault, pageOperations } = setup(existing);

    const newId = await pageOperations.create({
      folderId: null,
      title: 'Idea',
    });
    await pageOperations.open(newId);
    await pageOperations.save(newId, 'Edited body');

    expect(vault.getPage(newId)!.source.markdown).toBe('Edited body');
  });
});

/** Delays every writeFile call and records the order writes were made in. */
class SlowWriteFileSystem implements VaultFileSystem {
  public writeCallOrder: string[] = [];

  constructor(
    private readonly inner: VaultFileSystem,
    private readonly delayMs: number
  ) {}

  exists(path: string) {
    return this.inner.exists(path);
  }
  createDirectory(path: string) {
    return this.inner.createDirectory(path);
  }
  readDirectory(path: string) {
    return this.inner.readDirectory(path);
  }
  readFile(path: string) {
    return this.inner.readFile(path);
  }
  deleteFile(path: string) {
    return this.inner.deleteFile(path);
  }
  moveFile(sourcePath: string, destinationPath: string) {
    return this.inner.moveFile(sourcePath, destinationPath);
  }

  async writeFile(path: string, contents: string): Promise<void> {
    this.writeCallOrder.push(contents);
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    await this.inner.writeFile(path, contents);
  }
}

/**
 * Ported from the retired PersistenceDuplication.test.ts (originally
 * regression-testing PersistenceService vs. PageMutationService racing on
 * the same page before they shared one PagePersistenceCoordinator). Both
 * methods now live on PageOperations and already share the same coordinator
 * instance by construction, but the cross-method race itself is still worth
 * proving directly against the consolidated facade.
 */
describe('PageOperations: save/archive cross-method concurrency', () => {
  it('a concurrent save and archive on the same page both apply — content updates and archived status survive', async () => {
    const page = buildPage();
    const sharedStorage = new InMemoryVaultFileSystem();
    sharedStorage.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );
    const slowFileSystem = new SlowWriteFileSystem(sharedStorage, 20);
    const { vault, pageOperations } = setup(page, slowFileSystem);

    await pageOperations.open(page.id);

    const savePromise = pageOperations.save(page.id, 'Edited body');
    const archivePromise = pageOperations.archive(page.id);

    await Promise.all([savePromise, archivePromise]);

    expect(slowFileSystem.writeCallOrder).toHaveLength(2);
    expect(slowFileSystem.writeCallOrder[0]).toContain('Edited body');

    const finalPage = vault.getPage(page.id)!;
    const archivePath = archivePathFor(page);
    expect(finalPage.path).toBe(archivePath);
    expect(finalPage.source.markdown).toBe('Edited body');
    expect(finalPage.metadata.status).toBe('archived');
    expect(finalPage.metadata.archivedAt).not.toBeNull();
    expect(await sharedStorage.readFile(archivePath)).toContain('Edited body');
    expect(sharedStorage.hasFileSync(page.path)).toBe(false);
  });

  // The retired test's second case ("a markdown edit saved after archiving
  // preserves status") is not ported: it called PersistenceService.save()
  // directly, bypassing PageApplicationService.updateMarkdown's archived
  // check entirely, to prove the Gate mechanism itself preserves archived
  // status through a content-only write. Now that PageOperations owns both
  // the write and the archived-page-view-only rule, editing an archived
  // page is rejected by design — already proven by the "archived pages are
  // view-only" describe block above. Porting this scenario as written would
  // assert the opposite of that already-correct behavior.
});

describe('PageOperations.move()', () => {
  it('moves the page into the destination folder', async () => {
    const page = buildPage();
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, pageOperations } = setup(page, undefined, [
      makeArchiveFolder(),
      folder,
    ]);

    await pageOperations.move(page.id, 'folder-1');

    const moved = vault.getPage(page.id)!;
    expect(moved.path).toBe(`${ROOT}/Projects/Note.md`);
    expect(moved.parentId).toBe('folder-1');
  });

  it('throws for an unknown destination folder', async () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    await expect(
      pageOperations.move(page.id, 'does-not-exist')
    ).rejects.toThrow(/Folder not found/);
  });

  it('throws when the destination path is already occupied', async () => {
    const page = buildPage();
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const occupant = new PageBuilder().build({
      parentId: 'folder-1',
      page: {
        path: `${ROOT}/Projects/Note.md`,
        directoryPath: `${ROOT}/Projects`,
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
    const { vault, pageOperations, fileSystem } = setup(page, undefined, [
      makeArchiveFolder(),
      folder,
    ]);
    vault.addPage(occupant);
    (fileSystem as InMemoryVaultFileSystem).seedFile(
      occupant.path,
      new FrontmatterSerializer().serializeDocument(
        occupant,
        occupant.source.markdown
      )
    );

    await expect(pageOperations.move(page.id, 'folder-1')).rejects.toThrow(
      /Path already in use/
    );
  });

  it('throws for an unknown page id', async () => {
    const page = buildPage();
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { pageOperations } = setup(page, undefined, [
      makeArchiveFolder(),
      folder,
    ]);

    await expect(
      pageOperations.move('does-not-exist', 'folder-1')
    ).rejects.toThrow(/Page not found/);
  });

  it('a move immediately followed by a save on the same id resolves in order', async () => {
    const page = buildPage();
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { vault, pageOperations } = setup(page, undefined, [
      makeArchiveFolder(),
      folder,
    ]);

    await pageOperations.open(page.id);
    await pageOperations.move(page.id, 'folder-1');
    await pageOperations.save(page.id, 'Edited after move');

    const moved = vault.getPage(page.id)!;
    expect(moved.path).toBe(`${ROOT}/Projects/Note.md`);
    expect(moved.source.markdown).toBe('Edited after move');
  });
});

describe('PageOperations.rename() (completes spec §6 rename())', () => {
  it('renames the page in place, updating its path and name, without reparenting', async () => {
    const page = buildPage();
    const { vault, pageOperations } = setup(page);

    await pageOperations.rename(page.id, 'Renamed');

    const renamed = vault.getPage(page.id)!;
    expect(renamed.path).toBe(`${ROOT}/Renamed.md`);
    expect(renamed.name).toBe('Renamed');
    expect(renamed.parentId).toBeNull();
  });

  it('preserves the page under its current folder', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const page = new PageBuilder().build({
      parentId: 'folder-1',
      page: {
        path: `${ROOT}/Projects/Note.md`,
        directoryPath: `${ROOT}/Projects`,
        frontmatter: { id: 'page-1' },
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
    });
    const { vault, pageOperations } = setup(page, undefined, [
      makeArchiveFolder(),
      folder,
    ]);

    await pageOperations.rename(page.id, 'Renamed');

    const renamed = vault.getPage(page.id)!;
    expect(renamed.parentId).toBe('folder-1');
    expect(renamed.path).toBe(`${ROOT}/Projects/Renamed.md`);
  });

  it('throws for an unknown page id', async () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    await expect(
      pageOperations.rename('does-not-exist', 'Renamed')
    ).rejects.toThrow(/Page not found/);
  });

  it('a rename immediately followed by a save on the same id resolves in order', async () => {
    const page = buildPage();
    const { vault, pageOperations } = setup(page);

    await pageOperations.open(page.id);
    await pageOperations.rename(page.id, 'Renamed');
    await pageOperations.save(page.id, 'Edited after rename');

    const renamed = vault.getPage(page.id)!;
    expect(renamed.path).toBe(`${ROOT}/Renamed.md`);
    expect(renamed.source.markdown).toBe('Edited after rename');
  });
});

function setupEmpty(folders: Folder[] = [makeArchiveFolder()]) {
  const vault = makeVault([], folders);
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
  const pageOperations = new PageOperations(
    vault,
    workspace,
    documentRegistry,
    saveCoordinator,
    coordinator,
    new PagePathResolver(vault),
    new PageCreator(new UuidGenerator(), new PageFactory()),
    makeFolderOperations(vault, workspace, coordinator),
    new DailyNoteService(),
    () => {}
  );

  return {
    vault,
    fileSystem,
    workspace,
    documentRegistry,
    coordinator,
    pageOperations,
  };
}

describe('PageOperations: drafts (ADR-017)', () => {
  it('openDraft opens a session and marks the workspace open, with no Vault entry and no disk write', async () => {
    const { vault, fileSystem, workspace, documentRegistry, pageOperations } =
      setupEmpty();

    const id = await pageOperations.openDraft({
      folderId: null,
      title: 'Untitled',
    });

    expect(documentRegistry.get(id)).toBeDefined();
    expect(workspace.isPageOpen(id)).toBe(true);
    expect(vault.getPage(id)).toBeUndefined();
    expect(fileSystem.hasFileSync(`${ROOT}/Untitled.md`)).toBe(false);
  });

  it("first save() on a draft persists it through the Gate's create path, at a collision-free path", async () => {
    const { vault, fileSystem, pageOperations } = setupEmpty();

    const id = await pageOperations.openDraft({
      folderId: null,
      title: 'My Note',
    });
    await pageOperations.save(id, 'First real content');

    const page = vault.getPage(id)!;
    expect(page.id).toBe(id);
    expect(page.path).toBe(`${ROOT}/My Note.md`);
    expect(page.source.markdown).toBe('First real content');
    expect(fileSystem.hasFileSync(`${ROOT}/My Note.md`)).toBe(true);
  });

  it('a second save() on an already-persisted (promoted) draft is an ordinary save, not another create', async () => {
    const { vault, pageOperations } = setupEmpty();

    const id = await pageOperations.openDraft({
      folderId: null,
      title: 'Note',
    });
    await pageOperations.save(id, 'First');
    await pageOperations.save(id, 'Second');

    expect(vault.getPage(id)!.source.markdown).toBe('Second');
  });

  it('deleting a draft that was never saved is a no-op: no throw, no disk write, closes the session', async () => {
    const { fileSystem, workspace, documentRegistry, pageOperations } =
      setupEmpty();

    const id = await pageOperations.openDraft({
      folderId: null,
      title: 'Abandoned',
    });
    await expect(pageOperations.delete(id)).resolves.toBeUndefined();

    expect(documentRegistry.get(id)).toBeUndefined();
    expect(workspace.isPageOpen(id)).toBe(false);
    expect(fileSystem.hasFileSync(`${ROOT}/Abandoned.md`)).toBe(false);
  });

  it("save() on a real page that vanished out from under its session still throws 'Page not found', not a draft error", async () => {
    const page = buildPage();
    const { vault, pageOperations } = setup(page);

    await pageOperations.open(page.id);
    vault.removePage(page.id);

    await expect(pageOperations.save(page.id, 'x')).rejects.toThrow(
      /Page not found/
    );
  });

  it('openAtPath opens the real Vault page directly when one already exists at that path', async () => {
    const page = buildPage();
    const { workspace, documentRegistry, pageOperations } = setup(page);

    const id = await pageOperations.openAtPath(page.path, {
      type: 'daily-note',
    });

    expect(id).toBe(page.id);
    expect(documentRegistry.get(page.id)).toBeDefined();
    expect(workspace.isPageOpen(page.id)).toBe(true);
  });
});

describe('PageOperations: create note from folder ("+" button, ADR-017 reuse)', () => {
  it('openDraft({ folderId }) scopes the draft to that folder with no Vault entry and no disk write', async () => {
    const folder = {
      ...makeFolder('folder-1', `${ROOT}/Projects`),
      parentId: null,
    };
    const { vault, fileSystem, workspace, documentRegistry, pageOperations } =
      setupEmpty([folder]);

    const id = await pageOperations.openDraft({ folderId: folder.id });

    expect(pageOperations.getDraft(id)?.folderId).toBe(folder.id);
    expect(documentRegistry.get(id)).toBeDefined();
    expect(workspace.isPageOpen(id)).toBe(true);
    expect(workspace.activePageId).toBe(id);
    expect(vault.getPage(id)).toBeUndefined();
    expect(fileSystem.hasFileSync(`${ROOT}/Projects/Untitled.md`)).toBe(false);
  });

  it('openDraft({ folderId }) works for a nested folder', async () => {
    const parent = {
      ...makeFolder('folder-1', `${ROOT}/Projects`),
      parentId: null,
    };
    const child = {
      ...makeFolder('folder-2', `${ROOT}/Projects/Q1`),
      parentId: 'folder-1',
    };
    const { pageOperations } = setupEmpty([parent, child]);

    const id = await pageOperations.openDraft({ folderId: child.id });

    expect(pageOperations.getDraft(id)?.folderId).toBe(child.id);
  });

  it('opening drafts in two different folders keeps each scoped to its own folder, once the first is no longer an empty reusable draft', async () => {
    // findReusableDraftId (ADR-017) retargets a still-empty draft in place
    // rather than minting a second one — giving folder A's draft real
    // content is what makes folder B's openDraft() mint a genuinely new,
    // separately-scoped draft instead of stealing folder A's.
    const folderA = { ...makeFolder('folder-a', `${ROOT}/A`), parentId: null };
    const folderB = { ...makeFolder('folder-b', `${ROOT}/B`), parentId: null };
    const { pageOperations } = setupEmpty([folderA, folderB]);

    const idA = await pageOperations.openDraft({ folderId: folderA.id });
    pageOperations.commitEdit(idA, 'Real content');
    const idB = await pageOperations.openDraft({ folderId: folderB.id });

    expect(idA).not.toBe(idB);
    expect(pageOperations.getDraft(idA)?.folderId).toBe(folderA.id);
    expect(pageOperations.getDraft(idB)?.folderId).toBe(folderB.id);
  });

  it('first save() persists the folder-scoped draft as a markdown file inside that folder', async () => {
    const folder = {
      ...makeFolder('folder-1', `${ROOT}/Projects`),
      parentId: null,
    };
    const { vault, fileSystem, pageOperations } = setupEmpty([folder]);

    const id = await pageOperations.openDraft({
      folderId: folder.id,
      title: 'Kickoff',
    });
    await pageOperations.save(id, 'Agenda');

    const page = vault.getPage(id)!;
    expect(page.parentId).toBe(folder.id);
    expect(page.path).toBe(`${ROOT}/Projects/Kickoff.md`);
    expect(fileSystem.hasFileSync(`${ROOT}/Projects/Kickoff.md`)).toBe(true);
  });

  it('deleting the folder-scoped draft before any save is a no-op that closes the session, per the existing draft-deletion lifecycle', async () => {
    const folder = {
      ...makeFolder('folder-1', `${ROOT}/Projects`),
      parentId: null,
    };
    const { fileSystem, workspace, documentRegistry, pageOperations } =
      setupEmpty([folder]);

    const id = await pageOperations.openDraft({ folderId: folder.id });
    await expect(pageOperations.delete(id)).resolves.toBeUndefined();

    expect(documentRegistry.get(id)).toBeUndefined();
    expect(workspace.isPageOpen(id)).toBe(false);
    expect(fileSystem.hasFileSync(`${ROOT}/Projects/Untitled.md`)).toBe(false);
  });

  it('openAtPath opens a draft when nothing exists at that path yet, and a second call for the same path reuses it', async () => {
    const { vault, pageOperations } = setupEmpty();
    const path = `${ROOT}/Daily Notes/2026/August/2026-08-01.md`;

    const firstId = await pageOperations.openAtPath(path, {
      type: 'daily-note',
    });
    const secondId = await pageOperations.openAtPath(path, {
      type: 'daily-note',
    });

    expect(secondId).toBe(firstId);
    expect(vault.getPage(firstId)).toBeUndefined();
  });

  it('openAtPath defaults the draft title to the filename (minus .md) when no title is given, matching PageBuilder', async () => {
    const { pageOperations } = setupEmpty();
    const path = `${ROOT}/Daily Notes/2026/August/2026-08-01.md`;

    const id = await pageOperations.openAtPath(path, { type: 'daily-note' });

    expect(pageOperations.getDraft(id)?.title).toBe('2026-08-01');
  });

  it('openAtPath-opened draft persists at its exact deterministic path on first save, not a PagePathResolver-computed one', async () => {
    const { vault, pageOperations } = setupEmpty([
      makeArchiveFolder(),
      makeDailyNotesFolder(),
    ]);
    const path = `${ROOT}/Daily Notes/2026/August/2026-08-01.md`;

    const id = await pageOperations.openAtPath(path, {
      type: 'daily-note',
      title: '2026-08-01',
    });
    await pageOperations.save(id, "Today's entry");

    const persisted = vault.getPage(id)!;
    expect(persisted.path).toBe(path);
    expect(persisted.type).toBe('daily-note');
  });

  // Regression test for the reported bug: a Daily Note for any month
  // other than the one bootstrap-time scaffolding used to cover (retired
  // by ADR-019) failed to persist, because openAtPath's folderId fallback
  // (null, when the month folder isn't scanned yet) was trusted at save
  // time instead of being re-resolved. persistDraft now calls
  // DailyNoteService.ensureFolderChain for daily notes, which is what
  // this test actually exercises — no year/month folder exists in this
  // fixture at all, only the "Daily Notes" reserved root.
  it('persists a Daily Note whose year/month folder does not exist yet — materializing the chain via FolderOperations, not relying on a stale open-time parentId', async () => {
    const { vault, pageOperations } = setupEmpty([
      makeArchiveFolder(),
      makeDailyNotesFolder(),
    ]);
    const path = `${ROOT}/Daily Notes/2027/March/2027-03-15.md`;

    const id = await pageOperations.openAtPath(path, { type: 'daily-note' });
    await pageOperations.save(id, "March's entry");

    const persisted = vault.getPage(id)!;
    expect(persisted.path).toBe(path);

    const yearFolder = vault.getFolderByPath(`${ROOT}/Daily Notes/2027`);
    const monthFolder = vault.getFolderByPath(`${ROOT}/Daily Notes/2027/March`);
    expect(yearFolder).toBeDefined();
    expect(monthFolder).toBeDefined();
    expect(yearFolder!.parentId).toBe('folder-daily-notes');
    expect(monthFolder!.parentId).toBe(yearFolder!.id);
    expect(persisted.parentId).toBe(monthFolder!.id);
  });
});

describe('PageOperations.updateDraftTitle()', () => {
  it('a non-empty committed title promotes a regular-note draft immediately, with an empty body', async () => {
    const { vault, fileSystem, pageOperations } = setupEmpty();
    const id = await pageOperations.openDraft({ folderId: null });

    await pageOperations.updateDraftTitle(id, 'Test note');

    const persisted = vault.getPage(id)!;
    expect(persisted.path).toBe(`${ROOT}/Test note.md`);
    expect(persisted.name).toBe('Test note');
    expect(persisted.source.markdown).toBe('');
    expect(fileSystem.hasFileSync(`${ROOT}/Test note.md`)).toBe(true);
    expect(pageOperations.getDraft(id)).toBeUndefined();
  });

  it('a subsequent body save on a title-promoted draft is an ordinary save, not another create', async () => {
    const { vault, pageOperations } = setupEmpty();
    const id = await pageOperations.openDraft({ folderId: null });

    await pageOperations.updateDraftTitle(id, 'Test note');
    await pageOperations.open(id);
    await pageOperations.save(id, 'Hey');

    const persisted = vault.getPage(id)!;
    expect(persisted.path).toBe(`${ROOT}/Test note.md`);
    expect(persisted.source.markdown).toBe('Hey');
  });

  it('re-committing the same title is not a committed change: no promotion, no error', async () => {
    const { vault, pageOperations } = setupEmpty();
    const id = await pageOperations.openDraft({
      folderId: null,
      title: 'Same',
    });

    await pageOperations.updateDraftTitle(id, 'Same');

    expect(vault.getPage(id)).toBeUndefined();
    expect(pageOperations.getDraft(id)?.title).toBe('Same');
  });

  it('an empty committed title is not a committed change: no promotion, no error', async () => {
    const { vault, pageOperations } = setupEmpty();
    const id = await pageOperations.openDraft({ folderId: null });

    await pageOperations.updateDraftTitle(id, '');

    expect(vault.getPage(id)).toBeUndefined();
  });

  it('does not promote a Daily Note draft on title commit — only its own body/metadata commits do', async () => {
    const { vault, pageOperations } = setupEmpty([
      makeArchiveFolder(),
      makeDailyNotesFolder(),
    ]);
    const path = `${ROOT}/Daily Notes/2026/August/2026-08-01.md`;
    const id = await pageOperations.openAtPath(path, { type: 'daily-note' });

    await pageOperations.updateDraftTitle(id, 'Something else entirely');

    expect(vault.getPage(id)).toBeUndefined();
    expect(pageOperations.getDraft(id)?.title).toBe('Something else entirely');
  });

  it("notifies Workspace observers (ADR-006's amendment) for a non-promoting (Daily Note) title commit", async () => {
    const { workspace, pageOperations } = setupEmpty([
      makeArchiveFolder(),
      makeDailyNotesFolder(),
    ]);
    const path = `${ROOT}/Daily Notes/2026/August/2026-08-01.md`;
    const id = await pageOperations.openAtPath(path, { type: 'daily-note' });
    const listener = vi.fn();
    workspace.subscribe(listener);

    await pageOperations.updateDraftTitle(id, 'Something else entirely');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('throws for a non-draft id, and never calls Workspace.refresh()', async () => {
    const { workspace, pageOperations } = setupEmpty();
    const listener = vi.fn();
    workspace.subscribe(listener);

    await expect(
      pageOperations.updateDraftTitle('does-not-exist', 'x')
    ).rejects.toThrow(/No draft descriptor/);
    expect(listener).not.toHaveBeenCalled();
  });

  it('throws once a draft has been promoted to a persisted page', async () => {
    const { pageOperations } = setupEmpty();
    const id = await pageOperations.openDraft({
      folderId: null,
      title: 'Note',
    });
    await pageOperations.save(id, 'First content');

    await expect(
      pageOperations.updateDraftTitle(id, 'Renamed')
    ).rejects.toThrow(/No draft descriptor/);
  });
});

describe('PageOperations.updateMetadata(): draft promotion', () => {
  it('a committed metadata patch promotes a regular-note draft immediately, with an empty body', async () => {
    const { vault, fileSystem, pageOperations } = setupEmpty();
    const id = await pageOperations.openDraft({ folderId: null });

    await pageOperations.updateMetadata(id, { favorite: true });

    const persisted = vault.getPage(id)!;
    expect(persisted.metadata.favorite).toBe(true);
    expect(persisted.source.markdown).toBe('');
    expect(persisted.path).toBe(`${ROOT}/Untitled.md`);
    expect(fileSystem.hasFileSync(`${ROOT}/Untitled.md`)).toBe(true);
    expect(pageOperations.getDraft(id)).toBeUndefined();
  });

  it("a patch matching every field's default is not a committed change: no promotion, no error", async () => {
    const { vault, pageOperations } = setupEmpty();
    const id = await pageOperations.openDraft({ folderId: null });

    await pageOperations.updateMetadata(id, {
      favorite: false,
      description: null,
    });

    expect(vault.getPage(id)).toBeUndefined();
    expect(pageOperations.getDraft(id)).toBeDefined();
  });

  it('promotion via metadata uses whatever title was already captured', async () => {
    const { vault, pageOperations } = setupEmpty();
    const id = await pageOperations.openDraft({ folderId: null });
    await pageOperations.updateDraftTitle(id, ''); // no-op, still a draft
    const draft = await pageOperations.openDraft({
      folderId: null,
      title: 'My favorite note',
    });

    await pageOperations.updateMetadata(draft, { favorite: true });

    expect(vault.getPage(draft)!.path).toBe(`${ROOT}/My favorite note.md`);
  });

  // ADR-017's second amendment (Cover Image milestone): a Daily Note
  // draft now promotes on a genuine committed metadata change, the same
  // way an ordinary Note draft already does and the same way save()'s
  // body trigger already promoted one — reversing the prior amendment's
  // exclusion, which this test previously asserted as intended behavior
  // (see the ADR for why: setting a cover/favorite/etc. from a real menu
  // action is an explicit user action, not incidental draft interaction).
  it('promotes a Daily Note draft on a metadata commit, same as an ordinary Note draft', async () => {
    const { vault, fileSystem, pageOperations } = setupEmpty([
      makeArchiveFolder(),
      makeDailyNotesFolder(),
    ]);
    const path = `${ROOT}/Daily Notes/2026/August/2026-08-01.md`;
    const id = await pageOperations.openAtPath(path, { type: 'daily-note' });

    await pageOperations.updateMetadata(id, { favorite: true });

    const persisted = vault.getPage(id)!;
    expect(persisted.metadata.favorite).toBe(true);
    expect(persisted.path).toBe(path);
    expect(fileSystem.hasFileSync(path)).toBe(true);
    expect(pageOperations.getDraft(id)).toBeUndefined();
  });

  it('rejects for a truly unknown id', async () => {
    const { pageOperations } = setupEmpty();

    await expect(
      pageOperations.updateMetadata('does-not-exist', { favorite: true })
    ).rejects.toThrow(/Page not found/);
  });
});

// Regression coverage for the "Cover image" feature's draft-promotion
// flow (Draft → Add cover → persist/promote draft → save cover → persisted
// page), scoped specifically to the `cover` field and the guarantees the
// feature depends on: same id across promotion, no duplicate page, and
// existing (already-persisted) resources are unaffected by the widened
// draft-promotion trigger.
describe('PageOperations.updateMetadata(): "Cover image" draft-promotion flow', () => {
  it('a Note draft + cover promotes to a persisted Note with the cover in frontmatter, same id', async () => {
    const { vault, fileSystem, pageOperations } = setupEmpty();
    const id = await pageOperations.openDraft({ folderId: null });

    expect(pageOperations.getDraft(id)).toBeDefined();
    expect(vault.getPage(id)).toBeUndefined();

    await pageOperations.updateMetadata(id, {
      cover: 'https://example.com/cover.png',
    });

    const persisted = vault.getPage(id)!;
    expect(persisted.id).toBe(id);
    expect(persisted.metadata.cover).toBe('https://example.com/cover.png');
    expect(pageOperations.getDraft(id)).toBeUndefined();
    const content = await fileSystem.readFile(`${ROOT}/Untitled.md`);
    expect(content).toContain('https://example.com/cover.png');
  });

  it('a Daily Note draft + cover promotes to a persisted Daily Note with the cover in frontmatter, same id, no duplicate page', async () => {
    const { vault, fileSystem, pageOperations } = setupEmpty([
      makeArchiveFolder(),
      makeDailyNotesFolder(),
    ]);
    const path = `${ROOT}/Daily Notes/2026/August/2026-08-01.md`;
    const id = await pageOperations.openAtPath(path, { type: 'daily-note' });

    expect(pageOperations.getDraft(id)).toBeDefined();
    expect(vault.getPage(id)).toBeUndefined();

    await pageOperations.updateMetadata(id, {
      cover: 'https://example.com/daily-cover.png',
    });

    const persisted = vault.getPage(id)!;
    expect(persisted.id).toBe(id);
    expect(persisted.path).toBe(path);
    expect(persisted.metadata.cover).toBe(
      'https://example.com/daily-cover.png'
    );
    expect(pageOperations.getDraft(id)).toBeUndefined();
    const content = await fileSystem.readFile(path);
    expect(content).toContain('https://example.com/daily-cover.png');

    // No duplicate page: exactly one Vault page exists after promotion,
    // and re-opening "today" resolves to the same real page, not a second
    // draft (openAtPath's existing-page branch).
    expect(vault.pageCount).toBe(1);
    const reopenedId = await pageOperations.openAtPath(path, {
      type: 'daily-note',
    });
    expect(reopenedId).toBe(id);
    expect(vault.pageCount).toBe(1);
  });

  it('existing persisted pages continue to accept cover updates unchanged after this widening', async () => {
    const page = buildPage();
    const { vault, pageOperations } = setup(page);

    await pageOperations.updateMetadata(page.id, {
      cover: 'https://example.com/existing.png',
    });

    expect(vault.getPage(page.id)!.metadata.cover).toBe(
      'https://example.com/existing.png'
    );
  });
});

describe("Draft promotion race: a losing create attempt must not lose the other trigger's change", () => {
  // Scope, matching the ADR-017 amendment: this milestone guarantees exactly
  // one page is created, no duplicate create occurs, and no user-owned
  // metadata is lost when two promotion attempts race. It does NOT
  // guarantee which of two *different destination paths* (i.e. a
  // concurrent title change) wins — reconciling that is the future rename
  // capability's job, not draft promotion's. These tests deliberately
  // assert nothing about the resulting path.
  it('title-triggered and metadata-triggered promotion racing on the same draft: exactly one page is created, metadata is preserved, no errors', async () => {
    const { vault, pageOperations } = setupEmpty();
    const id = await pageOperations.openDraft({
      folderId: null,
      title: 'Race note',
    });

    const titlePromotion = pageOperations.updateDraftTitle(
      id,
      'Race note updated'
    );
    const metadataPromotion = pageOperations.updateMetadata(id, {
      favorite: true,
    });

    await Promise.all([titlePromotion, metadataPromotion]);

    expect(Array.from(vault.pages())).toHaveLength(1);
    const persisted = vault.getPage(id)!;
    expect(persisted.metadata.favorite).toBe(true);
  });

  it('the reverse arrival order also creates exactly one page with metadata preserved, no errors', async () => {
    const { vault, pageOperations } = setupEmpty();
    const id = await pageOperations.openDraft({
      folderId: null,
      title: 'Race note',
    });

    const metadataPromotion = pageOperations.updateMetadata(id, {
      favorite: true,
    });
    const titlePromotion = pageOperations.updateDraftTitle(
      id,
      'Race note updated'
    );

    await Promise.all([metadataPromotion, titlePromotion]);

    expect(Array.from(vault.pages())).toHaveLength(1);
    const persisted = vault.getPage(id)!;
    expect(persisted.metadata.favorite).toBe(true);
  });
});

describe('PageOperations.move()', () => {
  it('moves a note into an arbitrary destination folder, preserving its filename', async () => {
    const page = buildPage();
    const destination: Folder = {
      id: 'folder-1',
      name: 'Projects',
      path: `${ROOT}/Projects`,
      parentId: null,
      metadata: defaultFolderMetadata,
    };
    const { vault, pageOperations } = setup(page, undefined, [
      makeArchiveFolder(),
      destination,
    ]);

    await pageOperations.move(page.id, 'folder-1');

    const moved = vault.getPage(page.id)!;
    expect(moved.path).toBe(`${ROOT}/Projects/Note.md`);
    expect(moved.parentId).toBe('folder-1');
  });

  it('moves a note to the vault root when destinationFolderId is null', async () => {
    const nested = buildNamedPage('page-1', `${ROOT}/Projects/Note.md`);
    const destination: Folder = {
      id: 'folder-1',
      name: 'Projects',
      path: `${ROOT}/Projects`,
      parentId: null,
      metadata: defaultFolderMetadata,
    };
    const { vault, pageOperations } = setup(nested, undefined, [
      makeArchiveFolder(),
      destination,
    ]);

    await pageOperations.move(nested.id, null);

    const moved = vault.getPage(nested.id)!;
    expect(moved.path).toBe(`${ROOT}/Note.md`);
    expect(moved.parentId).toBeNull();
  });

  it('throws for an unknown page id', async () => {
    const page = buildPage();
    const { pageOperations } = setup(page);

    await expect(
      pageOperations.move('does-not-exist', ARCHIVE_FOLDER_ID)
    ).rejects.toThrow(/Page not found/);
  });

  it('rejects moving an archived page', async () => {
    const page = buildPage();
    const destination: Folder = {
      id: 'folder-1',
      name: 'Projects',
      path: `${ROOT}/Projects`,
      parentId: null,
      metadata: defaultFolderMetadata,
    };
    const { coordinator, pageOperations } = setup(page, undefined, [
      makeArchiveFolder(),
      destination,
    ]);
    await archiveDirectly(coordinator, page.id);

    await expect(pageOperations.move(page.id, 'folder-1')).rejects.toThrow(
      /Cannot move an archived page/
    );
  });

  it('rejects moving into the reserved Daily Notes folder', async () => {
    const page = buildPage();
    const dailyNotes = makeDailyNotesFolder();
    const { pageOperations } = setup(page, undefined, [
      makeArchiveFolder(),
      dailyNotes,
    ]);

    await expect(pageOperations.move(page.id, dailyNotes.id)).rejects.toThrow(
      /Cannot move into Daily Notes/
    );
  });

  it('rejects moving a Daily Note', async () => {
    const dailyNotes = makeDailyNotesFolder();
    const dailyNote = new PageBuilder(ROOT).build({
      parentId: dailyNotes.id,
      page: {
        path: `${ROOT}/Daily Notes/2026/August/2026-08-12.md`,
        directoryPath: `${ROOT}/Daily Notes/2026/August`,
        frontmatter: { id: 'page-daily' },
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
    });
    const destination: Folder = {
      id: 'folder-1',
      name: 'Projects',
      path: `${ROOT}/Projects`,
      parentId: null,
      metadata: defaultFolderMetadata,
    };
    expect(dailyNote.type).toBe('daily-note');
    const { pageOperations } = setup(dailyNote, undefined, [
      makeArchiveFolder(),
      destination,
    ]);

    await expect(pageOperations.move(dailyNote.id, 'folder-1')).rejects.toThrow(
      /Cannot move a Daily Note/
    );
  });
});
