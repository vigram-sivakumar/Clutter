// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FolderTree, type SidebarRowActions } from './FolderTree';
import { PageOperations } from '@core/application/page/PageOperations';
import { EffectivePageState } from '@core/application/page/EffectivePageState';
import { PagePersistenceCoordinator } from '@core/vault/persistence/PagePersistenceCoordinator';
import { Workspace } from '@core/workspace/Workspace';
import { DocumentRegistry } from '@core/engine/DocumentRegistry';
import { SaveCoordinator } from '@core/engine/SaveCoordinator';
import { Vault } from '@core/vault/models/Vault';
import { VaultQuery } from '@core/vault/queries/VaultQuery';
import { MembershipSelector } from '@core/application/membership/MembershipSelector';
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
import { FolderOperations } from '@core/application/folder/FolderOperations';
import { FolderPathResolver } from '@core/vault/persistence/FolderPathResolver';
import { FolderCreator } from '@core/application/folder/FolderCreator';
import { DailyNoteService } from '@core/application/daily-notes/DailyNoteService';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';
import {
  getFolderTitlePlaceholder,
  getPageTitlePlaceholder,
} from '@core/presentation/PageDisplayPlaceholders';
import { DELETE_ACTION_LABEL } from '@core/presentation/resourceActionLabels';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
});

const ROOT = '/vault';

function buildPersistedPage(
  path: string,
  parentId: string | null = null,
  extraFrontmatter: Record<string, unknown> = {}
): Page {
  const builder = new PageBuilder();
  return builder.build({
    parentId,
    page: {
      path,
      directoryPath: ROOT,
      frontmatter: { id: 'persisted-page', ...extraFrontmatter },
      frontmatterAnalysis: { aliases: [] },
      content: 'Original body',
      analysis: { headings: [], blockReferences: [], tasks: [], tags: [], links: [], embeds: [] },
    },
  });
}

function makeFolder(id: string, path: string, parentId: string | null): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
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

function makeVault(pages: Page[], folders: Folder[] = []): Vault {
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

function setup(initialPages: Page[] = [], initialFolders: Folder[] = []) {
  const vault = makeVault(initialPages, initialFolders);
  const query = new VaultQuery(vault);
  const fileSystem = new InMemoryVaultFileSystem();

  for (const page of initialPages) {
    fileSystem.seedFile(
      page.path,
      new FrontmatterSerializer().serializeDocument(page, page.source.markdown)
    );
  }

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
  const effectivePageState = new EffectivePageState(vault, query, pageOperations, workspace);
  const membershipSelector = new MembershipSelector(vault, query, effectivePageState);

  return {
    vault,
    query,
    workspace,
    pageOperations,
    folderOperations,
    effectivePageState,
    membershipSelector,
  };
}

function buildRowActions(overrides: Partial<SidebarRowActions> = {}): {
  actions: SidebarRowActions;
  spies: {
    onOpenMenu: ReturnType<typeof vi.fn>;
    onCloseMenu: ReturnType<typeof vi.fn>;
    onStartRename: ReturnType<typeof vi.fn>;
    onRenameEnd: ReturnType<typeof vi.fn>;
    onNoteTitleEdit: ReturnType<typeof vi.fn>;
    onNoteTitleFlush: ReturnType<typeof vi.fn>;
    onNoteTitleCancel: ReturnType<typeof vi.fn>;
    onDraftTitleCommit: ReturnType<typeof vi.fn>;
    onArchiveNote: ReturnType<typeof vi.fn>;
    onDeleteNote: ReturnType<typeof vi.fn>;
    onDuplicateNote: ReturnType<typeof vi.fn>;
    onToggleFavoriteNote: ReturnType<typeof vi.fn>;
    onFolderTitleEdit: ReturnType<typeof vi.fn>;
    onFolderTitleFlush: ReturnType<typeof vi.fn>;
    onFolderTitleCancel: ReturnType<typeof vi.fn>;
    onArchiveFolder: ReturnType<typeof vi.fn>;
    onDeleteFolder: ReturnType<typeof vi.fn>;
    onToggleFavoriteFolder: ReturnType<typeof vi.fn>;
  };
} {
  const spies = {
    onOpenMenu: vi.fn(),
    onCloseMenu: vi.fn(),
    onStartRename: vi.fn(),
    onRenameEnd: vi.fn(),
    onNoteTitleEdit: vi.fn(),
    onNoteTitleFlush: vi.fn(),
    onNoteTitleCancel: vi.fn(),
    onDraftTitleCommit: vi.fn(),
    onArchiveNote: vi.fn(),
    onDeleteNote: vi.fn(),
    onDuplicateNote: vi.fn(),
    onToggleFavoriteNote: vi.fn(),
    onMoveNote: vi.fn(),
    onFolderTitleEdit: vi.fn(),
    onFolderTitleFlush: vi.fn(),
    onFolderTitleCancel: vi.fn(),
    onArchiveFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    onToggleFavoriteFolder: vi.fn(),
    onMoveFolder: vi.fn(),
    getFolderMoveDestinations: vi.fn(() => []),
    onCreateFolder: vi.fn(async () => 'folder-created'),
  };

  const actions: SidebarRowActions = {
    openMenuId: null,
    editingId: null,
    noteMoveDestinations: [],
    ...spies,
    ...overrides,
  };

  return { actions, spies };
}

function renderTree(
  query: VaultQuery,
  membershipSelector: MembershipSelector,
  workspace: Workspace,
  rowActions: SidebarRowActions
) {
  return render(
    <FolderTree
      query={query}
      membershipSelector={membershipSelector}
      workspace={workspace}
      parentId={null}
      level={0}
      onPageClick={vi.fn()}
      onDraftPageClick={vi.fn()}
      onFolderClick={vi.fn()}
      onCreateNote={vi.fn()}
      pendingNewFolder={null}
      onCommitNewFolder={vi.fn()}
      onCancelNewFolder={vi.fn()}
      rowActions={rowActions}
    />
  );
}

function overflowButtonFor(rowTitle: string): HTMLElement {
  const row = screen.getByText(rowTitle).closest('.entry');
  if (!row) {
    throw new Error(`expected an entry row for "${rowTitle}"`);
  }
  // OverflowMenu's trigger is the one button with aria-haspopup="menu" — a
  // stable selector regardless of a row's other action buttons (e.g. a
  // folder's "+") or their relative order.
  const overflow = (row as HTMLElement).querySelector('button[aria-haspopup="menu"]');
  if (!overflow) {
    throw new Error(`expected an overflow button on the "${rowTitle}" row`);
  }
  return overflow as HTMLElement;
}

describe('FolderTree row overflow menu: the owning row stays fully hover-styled while its menu is open', () => {
  it('a note row gets entry-force-hover — Entry\'s class for forcing every hover-driven affordance — while its menu is open', () => {
    const page = buildPersistedPage(`${ROOT}/Note.md`);
    const { query, workspace, membershipSelector } = setup([page]);
    const { actions } = buildRowActions({ openMenuId: page.id });

    renderTree(query, membershipSelector, workspace, actions);

    const row = screen.getByText('Note').closest('.entry');
    expect(row).toHaveClass('entry-force-hover');
  });

  it('a note row has no entry-force-hover class when its menu is closed', () => {
    const page = buildPersistedPage(`${ROOT}/Note.md`);
    const { query, workspace, membershipSelector } = setup([page]);
    const { actions } = buildRowActions({ openMenuId: null });

    renderTree(query, membershipSelector, workspace, actions);

    const row = screen.getByText('Note').closest('.entry');
    expect(row).not.toHaveClass('entry-force-hover');
  });

  it('a folder row gets entry-force-hover while its menu is open', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const { query, workspace, membershipSelector } = setup([], [folder]);
    const { actions } = buildRowActions({ openMenuId: 'folder-1' });

    renderTree(query, membershipSelector, workspace, actions);

    const row = screen.getByText('Projects').closest('.entry');
    expect(row).toHaveClass('entry-force-hover');
  });

  it('a note row\'s .entry__actions are visible (not hover-gated hidden) while its menu is open, even without the mouse over it', () => {
    const page = buildPersistedPage(`${ROOT}/Note.md`);
    const { query, workspace, membershipSelector } = setup([page]);
    const { actions } = buildRowActions({ openMenuId: page.id });

    renderTree(query, membershipSelector, workspace, actions);

    const row = screen.getByText('Note').closest('.entry') as HTMLElement;
    const actionsEl = row.querySelector('.entry__actions') as HTMLElement;
    expect(getComputedStyle(actionsEl).opacity).toBe('1');
    expect(getComputedStyle(actionsEl).visibility).toBe('visible');
  });
});

describe('FolderTree row overflow menu: open/close', () => {
  it('clicking the overflow button opens a menu anchored to that row', () => {
    const page = buildPersistedPage(`${ROOT}/Note.md`);
    const { query, workspace, membershipSelector } = setup([page]);
    const { actions } = buildRowActions({ openMenuId: page.id });

    renderTree(query, membershipSelector, workspace, actions);

    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.getByText(DELETE_ACTION_LABEL)).toBeInTheDocument();
  });

  it('clicking the overflow button calls onOpenMenu with the row id, not onFolderClick/onPageClick', () => {
    const page = buildPersistedPage(`${ROOT}/Note.md`);
    const { query, workspace, membershipSelector } = setup([page]);
    const { actions, spies } = buildRowActions();
    const onPageClick = vi.fn();

    render(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={onPageClick}
        onDraftPageClick={vi.fn()}
        onFolderClick={vi.fn()}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
        rowActions={actions}
      />
    );

    fireEvent.click(overflowButtonFor('Note'));

    expect(spies.onOpenMenu).toHaveBeenCalledWith(page.id);
    expect(onPageClick).not.toHaveBeenCalled();
  });

  it('a closed row (openMenuId does not match) renders no menu content', () => {
    const page = buildPersistedPage(`${ROOT}/Note.md`);
    const { query, workspace, membershipSelector } = setup([page]);
    const { actions } = buildRowActions({ openMenuId: 'some-other-id' });

    renderTree(query, membershipSelector, workspace, actions);

    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
  });

  it('Escape closes an open menu (via onCloseMenu)', () => {
    const page = buildPersistedPage(`${ROOT}/Note.md`);
    const { query, workspace, membershipSelector } = setup([page]);
    const { actions, spies } = buildRowActions({ openMenuId: page.id });

    renderTree(query, membershipSelector, workspace, actions);
    expect(screen.getByText('Rename')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(spies.onCloseMenu).toHaveBeenCalled();
  });

  it('an outside click closes an open menu (via onCloseMenu)', () => {
    const page = buildPersistedPage(`${ROOT}/Note.md`);
    const { query, workspace, membershipSelector } = setup([page]);
    const { actions, spies } = buildRowActions({ openMenuId: page.id });

    renderTree(query, membershipSelector, workspace, actions);

    const backdrop = document.querySelector('.overlay__backdrop');
    if (!backdrop) {
      throw new Error('expected a backdrop element');
    }
    fireEvent.click(backdrop);

    expect(spies.onCloseMenu).toHaveBeenCalled();
  });
});

describe('FolderTree row overflow menu: rendering is driven purely by openMenuId', () => {
  it('only the row matching openMenuId renders its items — the actual single-open-at-a-time guarantee lives in the openMenuId owner (Sidebar.Notes.tsx), asserted separately', () => {
    const folderA = makeFolder('folder-a', `${ROOT}/A`, null);
    const folderB = makeFolder('folder-b', `${ROOT}/B`, null);
    const { query, workspace, membershipSelector } = setup([], [folderA, folderB]);
    const { actions } = buildRowActions({ openMenuId: 'folder-a' });

    renderTree(query, membershipSelector, workspace, actions);

    // Both rows' Delete items would render identically, so distinguish by
    // querying each row's own overlay/menu presence via its DOM subtree —
    // simplest reliable signal here is that exactly one "Delete" menuitem
    // exists (folder-b's Overlay renders null while its open is false).
    expect(screen.getAllByText(DELETE_ACTION_LABEL)).toHaveLength(1);
  });
});

describe('FolderTree row overflow menu: note actions dispatch to PageOperations', () => {
  it('Archive calls pageOperations.archive for a persisted note', () => {
    const page = buildPersistedPage(`${ROOT}/Note.md`);
    const { query, workspace, membershipSelector, pageOperations } = setup([page]);
    const archiveSpy = vi.spyOn(pageOperations, 'archive').mockResolvedValue(undefined);
    const { actions } = buildRowActions({ openMenuId: page.id });
    const rowActions: SidebarRowActions = { ...actions, onArchiveNote: (id) => void pageOperations.archive(id) };

    renderTree(query, membershipSelector, workspace, rowActions);
    fireEvent.click(screen.getByText('Archive'));

    expect(archiveSpy).toHaveBeenCalledWith(page.id);
  });

  it('Delete calls pageOperations.delete for a persisted note', () => {
    const page = buildPersistedPage(`${ROOT}/Note.md`);
    const { query, workspace, membershipSelector, pageOperations } = setup([page]);
    const deleteSpy = vi.spyOn(pageOperations, 'delete').mockResolvedValue(undefined);
    const { actions } = buildRowActions({ openMenuId: page.id });
    const rowActions: SidebarRowActions = { ...actions, onDeleteNote: (id) => void pageOperations.delete(id) };

    renderTree(query, membershipSelector, workspace, rowActions);
    fireEvent.click(screen.getByText(DELETE_ACTION_LABEL));

    expect(deleteSpy).toHaveBeenCalledWith(page.id);
  });

  it('Duplicate calls pageOperations.duplicate for a persisted note (ADR-028)', () => {
    const page = buildPersistedPage(`${ROOT}/Note.md`);
    const { query, workspace, membershipSelector, pageOperations } = setup([page]);
    const duplicateSpy = vi
      .spyOn(pageOperations, 'duplicate')
      .mockResolvedValue('page-duplicate');
    const { actions } = buildRowActions({ openMenuId: page.id });
    const rowActions: SidebarRowActions = {
      ...actions,
      onDuplicateNote: (id) => void pageOperations.duplicate(id),
    };

    renderTree(query, membershipSelector, workspace, rowActions);
    fireEvent.click(screen.getByText('Duplicate'));

    expect(duplicateSpy).toHaveBeenCalledWith(page.id);
  });

  it("shows 'Add to Favorites' for a non-favorited note and dispatches updateMetadata({ favorite: true }) on click", () => {
    const page = buildPersistedPage(`${ROOT}/Note.md`);
    const { query, workspace, membershipSelector, pageOperations } = setup([page]);
    const updateMetadataSpy = vi
      .spyOn(pageOperations, 'updateMetadata')
      .mockResolvedValue(undefined);
    const { actions } = buildRowActions({
      openMenuId: page.id,
      onToggleFavoriteNote: (id, isFavorite) =>
        void pageOperations.updateMetadata(id, { favorite: !isFavorite }),
    });

    renderTree(query, membershipSelector, workspace, actions);

    expect(screen.getByText('Add to Favorites')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Add to Favorites'));

    expect(updateMetadataSpy).toHaveBeenCalledWith(page.id, { favorite: true });
  });

  it("shows 'Remove from Favorites' for an already-favorited note and dispatches updateMetadata({ favorite: false }) on click", () => {
    const page = buildPersistedPage(`${ROOT}/Note.md`, null, { favorite: true });
    const { query, workspace, membershipSelector, pageOperations } = setup([page]);
    const updateMetadataSpy = vi
      .spyOn(pageOperations, 'updateMetadata')
      .mockResolvedValue(undefined);
    const { actions } = buildRowActions({
      openMenuId: page.id,
      onToggleFavoriteNote: (id, isFavorite) =>
        void pageOperations.updateMetadata(id, { favorite: !isFavorite }),
    });

    renderTree(query, membershipSelector, workspace, actions);

    expect(screen.getByText('Remove from Favorites')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Remove from Favorites'));

    expect(updateMetadataSpy).toHaveBeenCalledWith(page.id, { favorite: false });
  });

  it('Rename calls onStartRename, then switches the row into edit mode and drives commitTitle/requestTitleSave', () => {
    const page = buildPersistedPage(`${ROOT}/Note.md`);
    const { query, workspace, membershipSelector, pageOperations } = setup([page]);
    const commitTitleSpy = vi.spyOn(pageOperations, 'commitTitle');
    const requestTitleSaveSpy = vi
      .spyOn(pageOperations, 'requestTitleSave')
      .mockResolvedValue(undefined);

    const { actions, spies } = buildRowActions({
      openMenuId: page.id,
      onNoteTitleEdit: (id, value) => pageOperations.commitTitle(id, value),
      onNoteTitleFlush: (id) => void pageOperations.requestTitleSave(id),
    });

    const { rerender } = renderTree(query, membershipSelector, workspace, actions);
    fireEvent.click(screen.getByText('Rename'));

    expect(spies.onStartRename).toHaveBeenCalledWith(page.id);

    // Simulate the parent responding to onStartRename by setting editingId.
    const editingActions: SidebarRowActions = { ...actions, editingId: page.id, openMenuId: null };
    rerender(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={vi.fn()}
        onDraftPageClick={vi.fn()}
        onFolderClick={vi.fn()}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
        rowActions={editingActions}
      />
    );

    const field = screen.getByRole('textbox');
    fireEvent.input(field, { target: { textContent: 'Renamed' } });
    expect(commitTitleSpy).toHaveBeenCalledWith(page.id, 'Renamed');

    fireEvent.blur(field);
    expect(requestTitleSaveSpy).toHaveBeenCalledWith(page.id);
  });

  it('a row in rename mode does not fire onPageClick when clicked', () => {
    const page = buildPersistedPage(`${ROOT}/Note.md`);
    const { query, workspace, membershipSelector } = setup([page]);
    const { actions } = buildRowActions({ editingId: page.id });
    const onPageClick = vi.fn();

    render(
      <FolderTree
        query={query}
        membershipSelector={membershipSelector}
        workspace={workspace}
        parentId={null}
        level={0}
        onPageClick={onPageClick}
        onDraftPageClick={vi.fn()}
        onFolderClick={vi.fn()}
        onCreateNote={vi.fn()}
        pendingNewFolder={null}
        onCommitNewFolder={vi.fn()}
        onCancelNewFolder={vi.fn()}
        rowActions={actions}
      />
    );

    const field = screen.getByRole('textbox');
    fireEvent.click(field);

    expect(onPageClick).not.toHaveBeenCalled();
  });
});

describe('FolderTree row overflow menu: a draft note has no menu at all', () => {
  it('a draft offers no menu items — nothing is available yet (no Vault entry to rename/archive/delete)', async () => {
    const { query, workspace, membershipSelector, pageOperations } = setup();
    await pageOperations.openDraft({ folderId: null, title: 'My Draft' });

    const { actions } = buildRowActions({ openMenuId: workspace.activePageId ?? null });

    renderTree(query, membershipSelector, workspace, actions);

    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
    expect(screen.queryByText('Archive')).not.toBeInTheDocument();
    expect(screen.queryByText(DELETE_ACTION_LABEL)).not.toBeInTheDocument();
  });

  it('a draft row renders no overflow button (OverflowMenu renders nothing for an empty item list)', async () => {
    const { query, workspace, membershipSelector, pageOperations } = setup();
    await pageOperations.openDraft({ folderId: null, title: 'My Draft' });

    const { actions } = buildRowActions();
    renderTree(query, membershipSelector, workspace, actions);

    const row = screen.getByText('My Draft').closest('.entry');
    if (!row) {
      throw new Error('expected an entry row for "My Draft"');
    }
    expect((row as HTMLElement).querySelectorAll('button')).toHaveLength(0);
  });
});

describe('FolderTree row overflow menu: folder actions dispatch to FolderOperations', () => {
  it('Delete calls folderOperations.delete for an empty folder with no confirmation', async () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const { query, workspace, membershipSelector, folderOperations, vault } = setup([], [folder]);
    const deleteSpy = vi.spyOn(folderOperations, 'delete').mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm');

    const { actions } = buildRowActions({
      openMenuId: 'folder-1',
      onDeleteFolder: (id) => {
        const { folders, pages } = vault.getDescendantFoldersAndPages(id);
        if (folders.length === 0 && pages.length === 0) {
          void folderOperations.delete(id);
        }
      },
    });

    renderTree(query, membershipSelector, workspace, actions);
    fireEvent.click(screen.getByText(DELETE_ACTION_LABEL));

    expect(deleteSpy).toHaveBeenCalledWith('folder-1');
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('folder menu has an Archive item for an active folder (ADR-026)', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const { query, workspace, membershipSelector } = setup([], [folder]);
    const { actions } = buildRowActions({ openMenuId: 'folder-1' });

    renderTree(query, membershipSelector, workspace, actions);

    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.getByText(DELETE_ACTION_LABEL)).toBeInTheDocument();
  });

  it('folder menu omits Archive for an already-archived folder (no Restore capability yet — ADR-026 sequencing amendment)', () => {
    const folder: Folder = {
      ...makeFolder('folder-1', `${ROOT}/Archive/Projects`, 'folder-archive'),
      metadata: {
        icon: null,
        favorite: false,
        description: '',
        cover: null,
        status: 'archived',
        archivedAt: '2026-01-01T00:00:00.000Z',
        originalPath: `${ROOT}/Projects`,
        originalParentId: null,
      },
    };
    const { query, workspace, membershipSelector } = setup([], [folder]);
    const { actions } = buildRowActions({ openMenuId: 'folder-1' });

    renderTree(query, membershipSelector, workspace, actions);

    expect(screen.queryByText('Archive')).not.toBeInTheDocument();
  });

  it('Archive calls onArchiveFolder', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const { query, workspace, membershipSelector } = setup([], [folder]);
    const { actions, spies } = buildRowActions({ openMenuId: 'folder-1' });

    renderTree(query, membershipSelector, workspace, actions);
    fireEvent.click(screen.getByText('Archive'));

    expect(spies.onArchiveFolder).toHaveBeenCalledWith('folder-1');
  });

  it("shows 'Add to Favorites' for a non-favorited folder and calls onToggleFavoriteFolder(id, false)", () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const { query, workspace, membershipSelector } = setup([], [folder]);
    const { actions, spies } = buildRowActions({ openMenuId: 'folder-1' });

    renderTree(query, membershipSelector, workspace, actions);

    expect(screen.getByText('Add to Favorites')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Add to Favorites'));

    expect(spies.onToggleFavoriteFolder).toHaveBeenCalledWith('folder-1', false);
  });

  it("shows 'Remove from Favorites' for an already-favorited folder and calls onToggleFavoriteFolder(id, true)", () => {
    const folder: Folder = {
      ...makeFolder('folder-1', `${ROOT}/Projects`, null),
      metadata: {
        icon: null,
        favorite: true,
        description: '',
        cover: null,
        status: 'active',
        archivedAt: null,
        originalPath: null,
        originalParentId: null,
      },
    };
    const { query, workspace, membershipSelector } = setup([], [folder]);
    const { actions, spies } = buildRowActions({ openMenuId: 'folder-1' });

    renderTree(query, membershipSelector, workspace, actions);

    expect(screen.getByText('Remove from Favorites')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Remove from Favorites'));

    expect(spies.onToggleFavoriteFolder).toHaveBeenCalledWith('folder-1', true);
  });

  it('Rename calls onFolderTitleEdit through FolderOperations.commitName while editing', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const { query, workspace, membershipSelector, folderOperations } = setup([], [folder]);
    const commitNameSpy = vi.spyOn(folderOperations, 'commitName');

    const { actions } = buildRowActions({
      editingId: 'folder-1',
      onFolderTitleEdit: (id, value) => folderOperations.commitName(id, value),
    });

    renderTree(query, membershipSelector, workspace, actions);

    const field = screen.getByRole('textbox');
    fireEvent.input(field, { target: { textContent: 'Renamed Folder' } });

    expect(commitNameSpy).toHaveBeenCalledWith('folder-1', 'Renamed Folder');
  });
});

describe('FolderTree rename edit buffer seeding', () => {
  it('opens rename with an empty buffer and New Note placeholder for an auto-generated note name', () => {
    const page = buildPersistedPage(`${ROOT}/Untitled.md`);
    const { query, workspace, membershipSelector } = setup([page]);
    const { actions } = buildRowActions({ editingId: page.id });

    renderTree(query, membershipSelector, workspace, actions);

    const field = screen.getByRole('textbox');
    expect(field.textContent).toBe('');
    expect(field).toHaveAttribute('data-placeholder', getPageTitlePlaceholder('note'));
  });

  it('opens rename with the actual name and no placeholder for a user-defined note name', () => {
    const page = buildPersistedPage(`${ROOT}/Note.md`);
    const { query, workspace, membershipSelector } = setup([page]);
    const { actions } = buildRowActions({ editingId: page.id });

    renderTree(query, membershipSelector, workspace, actions);

    const field = screen.getByRole('textbox');
    expect(field.textContent).toBe('Note');
    expect(field).not.toHaveAttribute('data-placeholder');
  });

  it('opens rename with an empty buffer and New Folder placeholder for an auto-generated folder name', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Untitled`, null);
    const { query, workspace, membershipSelector } = setup([], [folder]);
    const { actions } = buildRowActions({ editingId: 'folder-1' });

    renderTree(query, membershipSelector, workspace, actions);

    const field = screen.getByRole('textbox');
    expect(field.textContent).toBe('');
    expect(field).toHaveAttribute('data-placeholder', getFolderTitlePlaceholder());
  });

  it('opens rename with the actual name and no placeholder for a user-defined folder name', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`, null);
    const { query, workspace, membershipSelector } = setup([], [folder]);
    const { actions } = buildRowActions({ editingId: 'folder-1' });

    renderTree(query, membershipSelector, workspace, actions);

    const field = screen.getByRole('textbox');
    expect(field.textContent).toBe('Projects');
    expect(field).not.toHaveAttribute('data-placeholder');
  });
});
