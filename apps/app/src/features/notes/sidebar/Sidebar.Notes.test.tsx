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

function setup(folders: Folder[]) {
  const vault = new Vault(
    ROOT,
    [],
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

function renderNotes(deps: ReturnType<typeof setup>) {
  return render(
    <Notes
      vault={deps.vault}
      query={deps.query}
      workspace={deps.workspace}
      navigation={deps.navigation}
      pageOperations={deps.pageOperations}
      folderOperations={deps.folderOperations}
      effectivePageState={deps.effectivePageState}
      membershipSelector={deps.membershipSelector}
      onOpen={vi.fn()}
      onOpenFolder={vi.fn()}
      onOpenDraft={vi.fn()}
    />
  );
}

function overflowButtonFor(rowTitle: string): HTMLElement {
  const row = screen.getByText(rowTitle).closest('.entry');
  if (!row) {
    throw new Error(`expected an entry row for "${rowTitle}"`);
  }
  const buttons = row.querySelectorAll('button');
  const overflow = buttons[buttons.length - 1];
  if (!overflow) {
    throw new Error(`expected an overflow button on the "${rowTitle}" row`);
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
    expect(screen.getAllByText('Delete')).toHaveLength(1);

    fireEvent.click(overflowButtonFor('Beta'));

    // Still exactly one Delete item rendered — Alpha's menu closed when
    // Beta's opened, rather than both being open simultaneously.
    expect(screen.getAllByText('Delete')).toHaveLength(1);
  });

  it('clicking the same row\'s overflow button again closes its own menu', () => {
    const folderA = makeFolder('folder-a', `${ROOT}/Alpha`);
    const deps = setup([folderA]);

    renderNotes(deps);

    fireEvent.click(overflowButtonFor('Alpha'));
    expect(screen.queryByText('Delete')).toBeInTheDocument();

    fireEvent.click(overflowButtonFor('Alpha'));
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });
});

describe('Sidebar Notes: folder delete wiring', () => {
  it('deletes an empty folder without a confirm prompt and calls FolderOperations.delete', async () => {
    const folder = makeFolder('folder-a', `${ROOT}/Alpha`);
    const deps = setup([folder]);
    const deleteSpy = vi.spyOn(deps.folderOperations, 'delete').mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, 'confirm');

    renderNotes(deps);

    fireEvent.click(overflowButtonFor('Alpha'));
    fireEvent.click(screen.getByText('Delete'));

    await Promise.resolve();
    await Promise.resolve();

    expect(deleteSpy).toHaveBeenCalledWith('folder-a');
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
