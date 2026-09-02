// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildTopBarActions } from './buildTopBarActions';
import { MembershipSelector } from '@core/application/membership/MembershipSelector';
import { EffectivePageState } from '@core/application/page/EffectivePageState';
import { PageOperations } from '@core/application/page/PageOperations';
import { PagePersistenceCoordinator } from '@core/vault/persistence/PagePersistenceCoordinator';
import { DocumentRegistry } from '@core/engine/DocumentRegistry';
import { SaveCoordinator } from '@core/engine/SaveCoordinator';
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
import { Vault } from '@core/vault/models/Vault';
import { VaultQuery } from '@core/vault/queries/VaultQuery';
import { VaultProjectionBuilder } from '@core/vault/knowledge/VaultProjectionBuilder';
import { KnowledgeGraph } from '@core/vault/models/graph/KnowledgeGraph';
import { Workspace } from '@core/workspace/Workspace';
import type { Folder } from '@core/vault/models/Folder';
import type { Page } from '@core/vault/models/Page';
import { DELETE_ACTION_LABEL } from '@core/presentation/resourceActionLabels';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn().mockResolvedValue('/tmp/photo.png'),
}));

// Overlay's positioning logic observes anchor/surface size via
// ResizeObserver, which jsdom doesn't implement — same stub
// ResourceTopBarActions.test.tsx already uses.
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

const activeFolderMetadata: Folder['metadata'] = {
  icon: null,
  favorite: false,
  description: '',
  cover: null,
  status: 'active',
  archivedAt: null,
  originalPath: null,
  originalParentId: null,
};

function makeFolder(
  id: string,
  path: string,
  parentId: string | null = null,
  status: Folder['metadata']['status'] = 'active'
): Folder {
  return {
    id,
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    parentId,
    metadata: { ...activeFolderMetadata, status },
  };
}

function makePage(
  id: string,
  path: string,
  parentId: string | null = null,
  status: 'active' | 'archived' = 'active'
): Page {
  return {
    id,
    type: 'note',
    name: path.slice(path.lastIndexOf('/') + 1, path.length - '.md'.length),
    path,
    parentId,
    metadata: {
      icon: null,
      cover: null,
      description: null,
      favorite: false,
      status,
      archivedAt: null,
      originalParentId: null,
      originalPath: null,
      createdAt: null,
      updatedAt: null,
    },
    source: { markdown: '' },
    analysis: {
      headings: [],
      aliases: [],
      blockReferences: [],
      tasks: [],
      tags: [],
      links: [],
      embeds: [],
    },
  };
}

function setup(folders: Folder[], pages: Page[] = []) {
  const vault = new Vault(
    ROOT,
    pages,
    folders,
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder()
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

  return { vault, membershipSelector, folderOperations, pageOperations };
}

function openOverflowMenu() {
  const overflow = document.querySelector('button[aria-haspopup="menu"]');
  if (!overflow) {
    throw new Error('expected an overflow trigger button');
  }
  fireEvent.click(overflow);
}

describe('buildTopBarActions: isDeletable (deletion-UX product decision)', () => {
  it('an ordinary (active, non-nested) note has no Delete item in the topbar menu', () => {
    const page = makePage('page-1', `${ROOT}/Note.md`);
    const { membershipSelector } = setup([], [page]);

    const { actions } = buildTopBarActions(page, { membershipSelector });
    render(<>{actions}</>);
    openOverflowMenu();

    expect(screen.queryByText(DELETE_ACTION_LABEL)).not.toBeInTheDocument();
  });

  it('an archived note has a Delete item in the topbar menu', () => {
    const page = makePage('page-1', `${ROOT}/Archive/Note.md`, null, 'archived');
    const { membershipSelector } = setup([], [page]);

    const { actions } = buildTopBarActions(page, { membershipSelector });
    render(<>{actions}</>);
    openOverflowMenu();

    expect(screen.getByText(DELETE_ACTION_LABEL)).toBeInTheDocument();
  });

  it('a note nested under an archived folder (an Archive descendant, own status untouched) has a Delete item', () => {
    const archivedFolder = makeFolder('folder-1', `${ROOT}/Archive/Projects`, null, 'archived');
    // Own status stays 'active' — ADR-026 §2: folder archive only patches
    // the folder's own metadata, descendants keep theirs untouched.
    const page = makePage('page-1', `${ROOT}/Archive/Projects/Note.md`, 'folder-1', 'active');
    const { membershipSelector } = setup([archivedFolder], [page]);

    const { actions } = buildTopBarActions(page, { membershipSelector });
    render(<>{actions}</>);
    openOverflowMenu();

    expect(screen.getByText(DELETE_ACTION_LABEL)).toBeInTheDocument();
  });

  it('an ordinary (active, root-level) folder has no Delete item in the topbar menu', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Projects`);
    const { membershipSelector } = setup([folder]);

    const { actions } = buildTopBarActions(folder, { membershipSelector });
    render(<>{actions}</>);
    openOverflowMenu();

    expect(screen.queryByText(DELETE_ACTION_LABEL)).not.toBeInTheDocument();
  });

  it('an archived folder has a Delete item in the topbar menu', () => {
    const folder = makeFolder('folder-1', `${ROOT}/Archive/Projects`, null, 'archived');
    const { membershipSelector } = setup([folder]);

    const { actions } = buildTopBarActions(folder, { membershipSelector });
    render(<>{actions}</>);
    openOverflowMenu();

    expect(screen.getByText(DELETE_ACTION_LABEL)).toBeInTheDocument();
  });

  it('a folder nested under an archived folder (an Archive descendant) has a Delete item', () => {
    const archivedParent = makeFolder('folder-1', `${ROOT}/Archive/Projects`, null, 'archived');
    const nestedFolder = makeFolder('folder-2', `${ROOT}/Archive/Projects/Sub`, 'folder-1', 'active');
    const { membershipSelector } = setup([archivedParent, nestedFolder]);

    const { actions } = buildTopBarActions(nestedFolder, { membershipSelector });
    render(<>{actions}</>);
    openOverflowMenu();

    expect(screen.getByText(DELETE_ACTION_LABEL)).toBeInTheDocument();
  });

  it('a non-empty archived folder still requires confirmation before Delete fires — the existing mechanism is preserved for the Archive view', () => {
    const archivedFolder = makeFolder('folder-1', `${ROOT}/Archive/Projects`, null, 'archived');
    const nestedPage = makePage('page-1', `${ROOT}/Archive/Projects/Note.md`, 'folder-1', 'active');
    const { membershipSelector, folderOperations } = setup([archivedFolder], [nestedPage]);
    const deleteSpy = vi.spyOn(folderOperations, 'delete').mockResolvedValue(undefined);

    const { actions } = buildTopBarActions(archivedFolder, {
      membershipSelector,
      onDelete: () => void folderOperations.delete(archivedFolder.id),
      deleteConfirmationMessage:
        'Delete this folder and everything inside it? This will permanently delete 0 folder(s) and 1 page(s). This cannot be undone.',
    });
    render(<>{actions}</>);
    openOverflowMenu();

    fireEvent.click(screen.getByText(DELETE_ACTION_LABEL));

    // The confirmation dialog opened instead of firing delete immediately.
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Delete permanently?')).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    expect(deleteSpy).toHaveBeenCalledWith('folder-1');
  });

  it('an EMPTY archived folder still requires confirmation before Delete fires — the product decision is to always confirm, not only when non-empty', () => {
    const archivedFolder = makeFolder('folder-1', `${ROOT}/Archive/Projects`, null, 'archived');
    const { membershipSelector, folderOperations } = setup([archivedFolder]);
    const deleteSpy = vi.spyOn(folderOperations, 'delete').mockResolvedValue(undefined);

    const { actions } = buildTopBarActions(archivedFolder, {
      membershipSelector,
      onDelete: () => void folderOperations.delete(archivedFolder.id),
      deleteConfirmationMessage: 'This cannot be undone.',
    });
    render(<>{actions}</>);
    openOverflowMenu();

    fireEvent.click(screen.getByText(DELETE_ACTION_LABEL));

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Delete permanently?')).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    expect(deleteSpy).toHaveBeenCalledWith('folder-1');
  });

  it('an archived note requires confirmation before Delete fires', () => {
    const page = makePage('page-1', `${ROOT}/Archive/Note.md`, null, 'archived');
    const { membershipSelector, pageOperations } = setup([], [page]);
    const deleteSpy = vi.spyOn(pageOperations, 'delete').mockResolvedValue(undefined);

    const { actions } = buildTopBarActions(page, {
      membershipSelector,
      onDelete: () => void pageOperations.delete(page.id),
      deleteConfirmationMessage: 'This cannot be undone.',
    });
    render(<>{actions}</>);
    openOverflowMenu();

    fireEvent.click(screen.getByText(DELETE_ACTION_LABEL));

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(screen.getByText('Delete permanently?')).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    expect(deleteSpy).toHaveBeenCalledWith('page-1');
  });
});
