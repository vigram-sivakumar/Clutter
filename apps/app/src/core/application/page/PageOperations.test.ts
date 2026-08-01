import { describe, expect, it, vi } from 'vitest';
import { PageOperations } from './PageOperations';
import { PagePersistenceCoordinator } from '../persistence/PagePersistenceCoordinator';
import { Workspace } from '../../workspace/Workspace';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import { SaveCoordinator } from '../../engine/SaveCoordinator';
import { DocumentState } from '../../engine/DocumentState';
import { Vault } from '../../vault/models/Vault';
import { VaultProjectionBuilder } from '../../vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '../../vault/models/graph/KnowledgeGraph';
import { FrontmatterSerializer } from '../../vault/understand/FrontmatterSerializer';
import { FrontmatterParser } from '../../vault/understand/FrontmatterParser';
import { PageRebuilder } from '../../vault/build/PageRebuilder';
import { MoveService } from '../move/MoveService';
import { PageBuilder } from '../../vault/build/PageBuilder';
import { InMemoryVaultFileSystem } from '../../vault/testing/InMemoryVaultFileSystem';
import type { Page } from '../../vault/models/Page';
import type { Folder } from '../../vault/models/Folder';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

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

function archivePathFor(page: Page): string {
  const filename = page.path.slice(page.path.lastIndexOf('/') + 1);
  return `${ROOT}/Archive/${filename}`;
}

function buildPage(overrides: { icon?: string; favorite?: boolean } = {}): Page {
  const builder = new PageBuilder();
  return builder.build({
    parentId: null,
    page: {
      path: `${ROOT}/Note.md`,
      directoryPath: ROOT,
      frontmatter: { id: 'page-1', icon: overrides.icon, favorite: overrides.favorite },
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

function setup(page: Page, fileSystem?: VaultFileSystem) {
  const vault = makeVault([page]);
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
    coordinator
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
async function archiveDirectly(coordinator: PagePersistenceCoordinator, pageId: string) {
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

    await expect(pageOperations.open('does-not-exist')).rejects.toThrow(/Page not found/);
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
    expect(documentRegistry.get(page.id)?.page.id).toBe(page.id);
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

    await expect(pageOperations.save(page.id, 'Attempted edit')).rejects.toThrow(
      /Cannot edit archived page/
    );

    expect(session.currentRevision).toBe(revisionBefore);
    expect(session.state).not.toBe(DocumentState.Saving);
    expect(vault.getPage(page.id)!.source.markdown).toBe('Original body');
    expect(await fileSystem.readFile(archivePath)).toBe(diskBefore);
  });

  it('a page archived after its session was already open is still rejected on the next edit', async () => {
    const page = buildPage();
    const { coordinator, pageOperations } = setup(page);

    await pageOperations.open(page.id);
    await expect(pageOperations.save(page.id, 'Edit while active')).resolves.toBeUndefined();
    expect(pageOperations.getSession(page.id)!.currentRevision.markdown).toBe(
      'Edit while active'
    );

    await archiveDirectly(coordinator, page.id);

    await expect(pageOperations.save(page.id, 'Edit after archiving')).rejects.toThrow(
      /Cannot edit archived page/
    );
  });

  it('once a page is restored to active status, edits are allowed again', async () => {
    const page = buildPage();
    const { vault, pageOperations } = setup(page);

    await pageOperations.open(page.id);
    const archived = { ...page, metadata: { ...page.metadata, status: 'archived' as const } };
    vault.replacePage(archived);

    await expect(pageOperations.save(page.id, 'Blocked')).rejects.toThrow();

    vault.replacePage({
      ...vault.getPage(page.id)!,
      metadata: { ...vault.getPage(page.id)!.metadata, status: 'active', archivedAt: null },
    });

    await expect(pageOperations.save(page.id, 'Edit after restore')).resolves.toBeUndefined();
    expect(vault.getPage(page.id)!.source.markdown).toBe('Edit after restore');
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

    await expect(pageOperations.save(page.id, 'New content')).rejects.toThrow('disk full');

    expect(pageOperations.getSession(page.id)!.state).toBe(DocumentState.SaveError);
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

    expect(pageOperations.getSession(page.id)!.state).toBe(DocumentState.SaveError);
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
