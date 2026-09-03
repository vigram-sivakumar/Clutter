// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FolderTree, type SidebarRowActions } from './FolderTree';
import { EffectivePageState } from '@core/application/page/EffectivePageState';
import { PageOperations } from '@core/application/page/PageOperations';
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
import type { VaultResource } from '@core/vault/models/VaultResource';

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

function makeResource(overrides: Partial<VaultResource> = {}): VaultResource {
  return {
    id: 'resource-1',
    kind: 'image',
    name: 'photo.png',
    path: `${ROOT}/Assets/photo.png`,
    parentId: null,
    ...overrides,
  };
}

function makeVault(resources: VaultResource[]): Vault {
  return new Vault(
    ROOT,
    [],
    [],
    [],
    [],
    [],
    new KnowledgeGraph([]),
    new VaultProjectionBuilder(),
    new Map(),
    resources
  );
}

function setup(resources: VaultResource[]) {
  const vault = makeVault(resources);
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

  return { vault, query, workspace, membershipSelector };
}

function buildRowActions(overrides: Partial<SidebarRowActions> = {}): {
  actions: SidebarRowActions;
  spies: {
    onRevealResourceInFinder: ReturnType<typeof vi.fn>;
    onCopyResourcePath: ReturnType<typeof vi.fn>;
    onArchiveResource: ReturnType<typeof vi.fn>;
  };
} {
  const spies = {
    onOpenMenu: vi.fn(),
    onCloseMenu: vi.fn(),
    onStartRename: vi.fn(),
    onRenameEnd: vi.fn(),
    onResourceTitleCommit: vi.fn(),
    onArchiveResource: vi.fn(),
    onMoveResource: vi.fn(),
    onRevealResourceInFinder: vi.fn(),
    onCopyResourcePath: vi.fn(),
  };

  const actions = {
    openMenuId: null,
    editingId: null,
    noteMoveDestinations: [],
    resourceMoveDestinations: [],
    ...spies,
    ...overrides,
  } as unknown as SidebarRowActions;

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

describe('FolderTree — resource location actions (Reveal in Finder / Copy path)', () => {
  it('an image resource row shows Reveal in Finder and Copy path', () => {
    const resource = makeResource({ id: 'img-1', kind: 'image', name: 'photo.png' });
    const { query, workspace, membershipSelector } = setup([resource]);
    const { actions } = buildRowActions({ openMenuId: resource.id });

    renderTree(query, membershipSelector, workspace, actions);

    expect(screen.getByText('Reveal in Finder')).toBeInTheDocument();
    expect(screen.getByText('Copy path')).toBeInTheDocument();
  });

  it('a pdf resource row ALSO shows Reveal in Finder and Copy path — the global pipeline gives image/pdf full parity', () => {
    const resource = makeResource({ id: 'pdf-1', kind: 'pdf', name: 'contract.pdf' });
    const { query, workspace, membershipSelector } = setup([resource]);
    const { actions } = buildRowActions({ openMenuId: resource.id });

    renderTree(query, membershipSelector, workspace, actions);

    expect(screen.getByText('Reveal in Finder')).toBeInTheDocument();
    expect(screen.getByText('Copy path')).toBeInTheDocument();
  });

  it('selecting Reveal in Finder calls onRevealResourceInFinder with the resource id', () => {
    const resource = makeResource({ id: 'img-1' });
    const { query, workspace, membershipSelector } = setup([resource]);
    const { actions, spies } = buildRowActions({ openMenuId: resource.id });

    renderTree(query, membershipSelector, workspace, actions);
    fireEvent.click(screen.getByText('Reveal in Finder'));

    expect(spies.onRevealResourceInFinder).toHaveBeenCalledWith('img-1');
  });

  it('clicking Copy path opens a submenu of From vault / Full path / As Markdown, with the parent menu still visible', () => {
    const resource = makeResource({ id: 'img-1' });
    const { query, workspace, membershipSelector } = setup([resource]);
    const { actions } = buildRowActions({ openMenuId: resource.id });

    renderTree(query, membershipSelector, workspace, actions);
    fireEvent.click(screen.getByText('Copy path'));

    expect(screen.getByText('From vault')).toBeInTheDocument();
    expect(screen.getByText('Full path')).toBeInTheDocument();
    expect(screen.getByText('As Markdown')).toBeInTheDocument();
    // The parent menu (Rename/Move to/Reveal/Copy path/Archive) is still
    // rendered — this is a submenu, not a replacement of the parent menu.
    expect(screen.getByText('Reveal in Finder')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
  });

  it('selecting "From vault" calls onCopyResourcePath with the resource id and the at-vault format', () => {
    const resource = makeResource({ id: 'img-1' });
    const { query, workspace, membershipSelector } = setup([resource]);
    const { actions, spies } = buildRowActions({ openMenuId: resource.id });

    renderTree(query, membershipSelector, workspace, actions);
    fireEvent.click(screen.getByText('Copy path'));
    fireEvent.click(screen.getByText('From vault'));

    expect(spies.onCopyResourcePath).toHaveBeenCalledWith('img-1', 'at-vault');
  });

  it('selecting "Full path" calls onCopyResourcePath with the full-path format', () => {
    const resource = makeResource({ id: 'img-1' });
    const { query, workspace, membershipSelector } = setup([resource]);
    const { actions, spies } = buildRowActions({ openMenuId: resource.id });

    renderTree(query, membershipSelector, workspace, actions);
    fireEvent.click(screen.getByText('Copy path'));
    fireEvent.click(screen.getByText('Full path'));

    expect(spies.onCopyResourcePath).toHaveBeenCalledWith('img-1', 'full-path');
  });

  it('selecting "As Markdown" calls onCopyResourcePath with the as-markdown format', () => {
    const resource = makeResource({ id: 'img-1' });
    const { query, workspace, membershipSelector } = setup([resource]);
    const { actions, spies } = buildRowActions({ openMenuId: resource.id });

    renderTree(query, membershipSelector, workspace, actions);
    fireEvent.click(screen.getByText('Copy path'));
    fireEvent.click(screen.getByText('As Markdown'));

    expect(spies.onCopyResourcePath).toHaveBeenCalledWith('img-1', 'as-markdown');
  });

  it('the image resource row still shows Rename/Move to/Archive alongside the new actions', () => {
    const resource = makeResource({ id: 'img-1' });
    const { query, workspace, membershipSelector } = setup([resource]);
    const { actions } = buildRowActions({ openMenuId: resource.id });

    renderTree(query, membershipSelector, workspace, actions);

    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Move to…')).toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
  });

  it('Archive renders last, after Reveal in Finder and Copy path', () => {
    const resource = makeResource({ id: 'img-1' });
    const { query, workspace, membershipSelector } = setup([resource]);
    const { actions } = buildRowActions({ openMenuId: resource.id });

    renderTree(query, membershipSelector, workspace, actions);

    const menu = screen.getByRole('menu');
    const labels = Array.from(
      menu.querySelectorAll('[role="menuitem"]')
    ).map((item) => item.textContent);

    expect(labels).toEqual([
      'Rename',
      'Move to…',
      'Reveal in Finder',
      'Copy path',
      'Archive',
    ]);
  });
});
