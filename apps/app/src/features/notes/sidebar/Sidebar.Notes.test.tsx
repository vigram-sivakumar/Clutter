// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Notes } from './Sidebar.Notes';
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
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';
import type { VaultResource } from '@core/vault/models/VaultResource';
import { PageBuilder } from '@core/vault/ingest/PageBuilder';

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

function makePage(id: string, path: string, overrides?: { favorite?: boolean }): Page {
  return new PageBuilder().build({
    parentId: null,
    page: {
      path,
      directoryPath: path.slice(0, path.lastIndexOf('/')),
      frontmatter: { id, favorite: overrides?.favorite },
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
}

function makeResource(overrides: Partial<VaultResource> = {}): VaultResource {
  return {
    id: 'resource-1',
    kind: 'image',
    name: 'photo.png',
    path: `${ROOT}/photo.png`,
    parentId: null,
    ...overrides,
  };
}

function setup(
  folders: Folder[],
  pages: Page[] = [],
  resources: VaultResource[] = []
) {
  const vault = new Vault(
    ROOT,
    pages,
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    resources
  );
  const query = new VaultQuery(vault);
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
  const effectivePageState = new EffectivePageState(vault, query, pageOperations, workspace);
  const membershipSelector = new MembershipSelector(vault, query, effectivePageState);
  const navigation = { openWorkspace: vi.fn() } as unknown as NavigationRouter;

  return {
    vault,
    query,
    workspace,
    pageOperations,
    folderOperations,
    effectivePageState,
    membershipSelector,
    navigation,
  };
}

function notesElement(
  deps: ReturnType<typeof setup>,
  overrides?: {
    onOpen?(pageId: string): void;
    onOpenFolder?(folderId: string): void;
  }
) {
  return (
    <Notes
      vault={deps.vault}
      query={deps.query}
      workspace={deps.workspace}
      navigation={deps.navigation}
      pageOperations={deps.pageOperations}
      folderOperations={deps.folderOperations}
      effectivePageState={deps.effectivePageState}
      membershipSelector={deps.membershipSelector}
      onOpen={overrides?.onOpen ?? vi.fn()}
      onOpenFolder={overrides?.onOpenFolder ?? vi.fn()}
      onOpenDraft={vi.fn()}
    />
  );
}

function renderNotes(
  deps: ReturnType<typeof setup>,
  overrides?: Parameters<typeof notesElement>[1]
) {
  return render(notesElement(deps, overrides));
}

function overflowButtonFor(rowTitle: string): HTMLElement {
  const row = screen.getByText(rowTitle).closest('.entry');
  if (!row) {
    throw new Error(`expected an entry row for "${rowTitle}"`);
  }
  // OverflowMenu's trigger is the one button with aria-haspopup="menu" — a
  // stable selector regardless of a row's other action buttons (e.g. a
  // folder's "+") or their relative order.
  const overflow = row.querySelector('button[aria-haspopup="menu"]');
  if (!overflow) {
    throw new Error(`expected an overflow button on the "${rowTitle}" row`);
  }
  return overflow as HTMLElement;
}

/** Same lookup as overflowButtonFor, but scoped to a specific row title
 *  element rather than found via text (needed when the same title renders
 *  more than once, e.g. a favorited page's Favorites row and Workspace row). */
function overflowButtonForEntry(rowTitleElement: HTMLElement): HTMLElement {
  const row = rowTitleElement.closest('.entry');
  if (!row) {
    throw new Error('expected an entry row for the given title element');
  }
  const overflow = row.querySelector('button[aria-haspopup="menu"]');
  if (!overflow) {
    throw new Error('expected an overflow button on the given row');
  }
  return overflow as HTMLElement;
}

describe('Sidebar Notes: only one row menu is open at a time', () => {
  it('opening a second row\'s menu closes the first', () => {
    const folderA = makeFolder('folder-a', `${ROOT}/Alpha`);
    const folderB = makeFolder('folder-b', `${ROOT}/Beta`);
    const deps = setup([folderA, folderB]);

    renderNotes(deps);

    fireEvent.click(overflowButtonFor('Alpha'));
    expect(screen.getAllByText('Archive')).toHaveLength(1);

    fireEvent.click(overflowButtonFor('Beta'));

    // Still exactly one Archive item rendered — Alpha's menu closed when
    // Beta's opened, rather than both being open simultaneously.
    expect(screen.getAllByText('Archive')).toHaveLength(1);
  });

  it('clicking the same row\'s overflow button again closes its own menu', () => {
    const folderA = makeFolder('folder-a', `${ROOT}/Alpha`);
    const deps = setup([folderA]);

    renderNotes(deps);

    fireEvent.click(overflowButtonFor('Alpha'));
    expect(screen.queryByText('Archive')).toBeInTheDocument();

    fireEvent.click(overflowButtonFor('Alpha'));
    expect(screen.queryByText('Archive')).not.toBeInTheDocument();
  });
});

describe('Sidebar Notes: a favorited page\'s Favorites row and Workspace row have independent menu state', () => {
  it('opening the Favorites row\'s overflow menu does not also open the Workspace row\'s menu for the same page ID', () => {
    // A favorited root-level page renders twice — once under Favorites,
    // once under Workspace — both referencing the same page ID. Each is
    // still its own Entry instance and must own its own menu state.
    const page = makePage('page-a', `${ROOT}/Idea.md`, { favorite: true });
    const deps = setup([], [page]);

    renderNotes(deps);

    const rows = screen.getAllByText('Idea');
    expect(rows).toHaveLength(2);
    const [favoritesRow, workspaceRow] = rows as [HTMLElement, HTMLElement];

    fireEvent.click(overflowButtonForEntry(favoritesRow));

    // Only the Favorites row's menu opened — a single Archive item, not two
    // (two would mean the Workspace row for the same page ID opened too).
    expect(screen.getAllByText('Archive')).toHaveLength(1);

    // The Workspace row's own overflow button opens its own menu on top of
    // the still-open Favorites one — proving the two are independently
    // owned, not just coincidentally closed a moment ago. (If both were
    // still driven by one shared "which id is open" boolean, this second
    // click would have no visible effect beyond what the first already
    // caused.)
    fireEvent.click(overflowButtonForEntry(workspaceRow));
    expect(screen.getAllByText('Archive')).toHaveLength(2);
  });
});

// Section's title/caret split (Section.Header.tsx): the title text is a
// navigation trigger (Section's own onClick, wired here to
// navigation.openWorkspace() — the same "clicking a section header
// navigates there" pattern Favorites already has), while the caret is the
// sole expand/collapse control (Entry's nested-interactive-element guard
// stops the caret's click from also bubbling into the row's onClick). This
// replaced an earlier isTitleToggle-based design where the title itself
// toggled collapse — see the commented-out `isTitleToggle` prop still
// sitting next to this Section in Sidebar.Notes.tsx.
describe('Sidebar Notes: clicking the "Workspace" section header title navigates, the caret toggles collapse', () => {
  it('clicking the title text calls navigation.openWorkspace() and does not toggle collapse', () => {
    const deps = setup([makeFolder('folder-a', `${ROOT}/Alpha`)]);

    renderNotes(deps);

    expect(deps.workspace.isSectionExpanded('folders')).toBe(true);

    fireEvent.click(screen.getByText('Workspace'));

    expect(deps.navigation.openWorkspace).toHaveBeenCalledTimes(1);
    expect(deps.workspace.isSectionExpanded('folders')).toBe(true);
  });

  it("toggles the folders section's expanded state via its caret, without navigating", () => {
    // A non-empty folder list, deliberately — with none, Section's own
    // isEmpty-default-collapsed behavior (Section.test.tsx) makes the first
    // click *expand* the visually-collapsed section rather than flip the
    // already-true stored value, which isn't what this test is checking.
    const deps = setup([makeFolder('folder-a', `${ROOT}/Alpha`)]);

    // Production always re-renders Notes on a workspace change via
    // Sidebar.tsx's useWorkspace() subscription (not exercised here, since
    // this test renders Notes in isolation) — rerender() after each click
    // stands in for that, so Section sees the updated isExpanded prop it'd
    // get in the real app, same idiom Section.test.tsx uses for itself.
    const { rerender } = renderNotes(deps);

    expect(deps.workspace.isSectionExpanded('folders')).toBe(true);

    function clickWorkspaceCaret() {
      const header = screen.getByText('Workspace').closest('.section-header') as HTMLElement;
      const caret = header.querySelector('.section-header__caret') as HTMLElement;
      fireEvent.click(caret);
    }

    clickWorkspaceCaret();
    rerender(notesElement(deps));

    expect(deps.workspace.isSectionExpanded('folders')).toBe(false);
    expect(deps.navigation.openWorkspace).not.toHaveBeenCalled();

    clickWorkspaceCaret();
    rerender(notesElement(deps));

    expect(deps.workspace.isSectionExpanded('folders')).toBe(true);
    expect(deps.navigation.openWorkspace).not.toHaveBeenCalled();
  });
});

describe('Sidebar Notes: empty-vault detection considers root resources', () => {
  it('a vault with only a root-level resource (no folders, no pages) does not default the Workspace section to collapsed', () => {
    const resource = makeResource({ id: 'resource-1', name: 'photo.png', parentId: null });
    const deps = setup([], [], [resource]);

    renderNotes(deps);

    // If isFoldersEmpty wrongly ignored root resources, Section would
    // default to collapsed (isEmpty && !hasBeenToggled) and render no
    // children at all — the resource row would not be in the document.
    expect(screen.getByText('photo.png')).toBeInTheDocument();
  });
});

// No "Sidebar Notes: folder delete wiring" describe block — the sidebar
// folder menu never includes a 'delete' item (deletion-UX product
// decision), so there is nothing here to dispatch. Permanent Delete moved
// entirely to the topbar — see
// app/layouts/page/topbar/ResourceTopBarActions.test.tsx.

describe('Sidebar Notes: Duplicate leaves the current selection untouched', () => {
  it('a note row\'s Duplicate calls PageOperations.duplicate but never opens or selects the result', async () => {
    const page = makePage('page-a', `${ROOT}/Idea.md`);
    const deps = setup([], [page]);
    const duplicateSpy = vi
      .spyOn(deps.pageOperations, 'duplicate')
      .mockResolvedValue('page-copy');
    const openSpy = vi.spyOn(deps.pageOperations, 'open');
    const onOpen = vi.fn();

    renderNotes(deps, { onOpen });

    fireEvent.click(overflowButtonFor('Idea'));
    fireEvent.click(screen.getByText('Duplicate'));

    await Promise.resolve();
    await Promise.resolve();

    expect(duplicateSpy).toHaveBeenCalledWith('page-a');
    expect(openSpy).not.toHaveBeenCalled();
    // The row's own click handler must not have fired either — clicking a
    // menu item bubbling into the row's onClick was the actual bug (see
    // OverflowMenu.test.tsx's matching regression test).
    expect(onOpen).not.toHaveBeenCalled();
    // Nothing was ever selected — the sidebar's Duplicate never navigates.
    expect(deps.workspace.activePageId).toBeNull();
  });

  it('regression: Note A open, sidebar-duplicating Note B leaves Note A open (the reported bug — Note B\'s own row was incorrectly opening)', async () => {
    const noteA = makePage('page-a', `${ROOT}/Note A.md`);
    const noteB = makePage('page-b', `${ROOT}/Note B.md`);
    const deps = setup([], [noteA, noteB]);
    vi.spyOn(deps.pageOperations, 'duplicate').mockResolvedValue('page-b-copy');
    const onOpen = vi.fn((pageId: string) => {
      // Mirrors production's real wiring (Sidebar.tsx: onOpen={(id) =>
      // pageOperations.open(id)}) closely enough to prove the row's
      // onClick never fires for a menu selection: if it did, this would
      // switch the active page away from Note A.
      deps.workspace.openPage(pageId);
    });

    // Note A is the currently open page — the state the bug clobbered.
    deps.workspace.openPage('page-a');

    renderNotes(deps, { onOpen });

    fireEvent.click(overflowButtonFor('Note B'));
    fireEvent.click(screen.getByText('Duplicate'));

    await Promise.resolve();
    await Promise.resolve();

    expect(onOpen).not.toHaveBeenCalled();
    expect(deps.workspace.activePageId).toBe('page-a');
  });
});

// Consistency fix: one confirmation mechanism (the shared Confirmation/
// Dialog surface, never window.confirm()), one domain operation regardless
// of entry point, and no resurrection of navigation.openWorkspace() as a
// destructive-action fallback. Delete has no sidebar entry point any more
// (deletion-UX product decision) — the delete-specific cases this
// describe block used to cover moved to
// app/layouts/page/topbar/ResourceTopBarActions.test.tsx.
describe('Sidebar Notes: archive confirmation consistency', () => {
  it('note archive calls PageOperations.archive() directly, with no confirmation dialog', () => {
    const page = makePage('page-1', `${ROOT}/Note.md`);
    const deps = setup([], [page]);
    const archiveSpy = vi.spyOn(deps.pageOperations, 'archive').mockResolvedValue(undefined);
    renderNotes(deps);

    fireEvent.click(overflowButtonFor('Note'));
    fireEvent.click(screen.getByText('Archive'));

    expect(archiveSpy).toHaveBeenCalledWith('page-1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('empty folder archive calls FolderOperations.archive() directly, with no confirmation dialog', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const deps = setup([folder]);
    const archiveSpy = vi.spyOn(deps.folderOperations, 'archive').mockResolvedValue(undefined);
    renderNotes(deps);

    fireEvent.click(overflowButtonFor('Projects'));
    fireEvent.click(screen.getByText('Archive'));

    expect(archiveSpy).toHaveBeenCalledWith('folder-1');
    expect(screen.queryByText(/Archive this folder/)).toBeNull();
  });

  it('non-empty folder archive: shows the shared Confirmation dialog, Cancel does not archive', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const note = { ...makePage('page-1', `${ROOT}/Projects/Note.md`), parentId: 'folder-1' };
    const deps = setup([folder], [note]);
    const archiveSpy = vi.spyOn(deps.folderOperations, 'archive').mockResolvedValue(undefined);
    renderNotes(deps);

    fireEvent.click(overflowButtonFor('Projects'));
    fireEvent.click(screen.getByText('Archive'));

    expect(archiveSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Archive this folder?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(archiveSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('Archive this folder?')).not.toBeInTheDocument();
  });

  it('non-empty folder archive: Confirm invokes FolderOperations.archive()', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const note = { ...makePage('page-1', `${ROOT}/Projects/Note.md`), parentId: 'folder-1' };
    const deps = setup([folder], [note]);
    const archiveSpy = vi.spyOn(deps.folderOperations, 'archive').mockResolvedValue(undefined);
    renderNotes(deps);

    fireEvent.click(overflowButtonFor('Projects'));
    fireEvent.click(screen.getByText('Archive'));
    const confirmButtons = screen.getAllByRole('button', { name: 'Archive' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    expect(archiveSpy).toHaveBeenCalledWith('folder-1');
    expect(screen.queryByText('Archive this folder?')).not.toBeInTheDocument();
  });

  it('never calls navigation.openWorkspace() for any archive flow — the deprecated fallback must not resurface', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const note = { ...makePage('page-1', `${ROOT}/Projects/Note.md`), parentId: 'folder-1' };
    const deps = setup([folder], [note]);
    vi.spyOn(deps.folderOperations, 'archive').mockResolvedValue(undefined);
    renderNotes(deps);

    fireEvent.click(overflowButtonFor('Projects'));
    fireEvent.click(screen.getByText('Archive'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Archive' }).at(-1)!);

    expect(deps.navigation.openWorkspace).not.toHaveBeenCalled();
  });
});

describe('Sidebar Notes: overflow → Rename focus transition', () => {
  // Regression: the overflow menu's own "return focus to trigger on
  // close" accessibility behavior (useOverlayFocus) used to run *after*
  // the newly-mounted EditableText's autoFocus (React always finishes
  // every layout effect before any passive effect in the same commit),
  // silently stealing focus back and ending the rename session before the
  // user could type anything. Fixed generically in OverflowMenu/Overlay
  // (opensInlineEdit + suppressReturnFocusRef) — these confirm both a
  // Note and a Folder row (the two existing "Rename" consumers besides
  // Tag) actually benefit from it, not just Tag.
  it('a Note row: clicking Rename leaves the EditableText mounted and focused, caret at the end', () => {
    const note = makePage('page-1', `${ROOT}/Meeting notes.md`);
    const deps = setup([], [note]);
    renderNotes(deps);

    fireEvent.click(overflowButtonFor('Meeting notes'));
    fireEvent.click(screen.getByText('Rename'));

    const field = screen.getByRole('textbox');
    expect(field).toBe(document.activeElement);
    const selection = window.getSelection();
    expect(selection?.isCollapsed).toBe(true);
    expect(selection?.anchorOffset).toBe('Meeting notes'.length);
  });

  it('a Folder row: clicking Rename leaves the EditableText mounted and focused, caret at the end', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const deps = setup([folder]);
    renderNotes(deps);

    fireEvent.click(overflowButtonFor('Projects'));
    fireEvent.click(screen.getByText('Rename'));

    const field = screen.getByRole('textbox');
    expect(field).toBe(document.activeElement);
    const selection = window.getSelection();
    expect(selection?.isCollapsed).toBe(true);
    expect(selection?.anchorOffset).toBe('Projects'.length);
  });
});
