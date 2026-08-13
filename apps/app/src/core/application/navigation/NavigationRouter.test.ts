import { describe, expect, it, vi } from 'vitest';
import type { Folder } from '../../vault/models/Folder';
import type { Page } from '../../vault/models/Page';
import { NavigationRouter } from './NavigationRouter';
import type { FolderOperations } from '../folder/FolderOperations';
import type { PageOperations } from '../page/PageOperations';
import type { Vault } from '../../vault/models/Vault';
import type { ActiveView, Workspace } from '../../workspace/Workspace';
import type { ReservedFolderId } from '../../vault/initialize/ReservedResources';

type WorkspaceHistoryMethods =
  | 'canNavigateBack'
  | 'canNavigateForward'
  | 'peekBack'
  | 'peekForward'
  | 'discardBackEntry'
  | 'discardForwardEntry'
  | 'popBackForReplay'
  | 'popForwardForReplay'
  | 'openFilteredView';

function createNavigationRouter(options: {
  folderOperations?: Partial<Pick<FolderOperations, 'open' | 'ensureReservedFolder'>>;
  pageOperations?: Partial<Pick<PageOperations, 'open' | 'getDraft'>>;
  vault?: Partial<Pick<Vault, 'getReservedFolder' | 'getPage' | 'getFolder'>>;
  workspace?: Partial<Pick<Workspace, WorkspaceHistoryMethods>>;
}): NavigationRouter {
  return new NavigationRouter(
    options.folderOperations as FolderOperations,
    {
      getDraft: () => undefined,
      ...options.pageOperations,
    } as PageOperations,
    options.vault as Vault,
    options.workspace as Workspace
  );
}

/**
 * A minimal in-memory stand-in for Workspace's history stacks, driving the
 * same six methods NavigationRouter.back()/forward() call — lets these
 * tests exercise the real pop/peek/discard sequencing without pulling in
 * the full Workspace class (already covered by Workspace.test.ts).
 */
function createFakeHistory(
  back: ActiveView[],
  forward: ActiveView[] = [],
  initialActive?: ActiveView
) {
  const backStack = [...back];
  const forwardStack = [...forward];
  let active: ActiveView | undefined = initialActive;

  return {
    backStack,
    forwardStack,
    get canNavigateBack() {
      return backStack.length > 0;
    },
    get canNavigateForward() {
      return forwardStack.length > 0;
    },
    peekBack: () => backStack.at(-1),
    peekForward: () => forwardStack.at(-1),
    discardBackEntry: () => {
      backStack.pop();
    },
    discardForwardEntry: () => {
      forwardStack.pop();
    },
    popBackForReplay: () => {
      const entry = backStack.pop();
      if (active) forwardStack.push(active);
      active = entry;
    },
    popForwardForReplay: () => {
      const entry = forwardStack.pop();
      if (active) backStack.push(active);
      active = entry;
    },
    openFilteredView: vi.fn(),
  };
}

/**
 * A fake FolderOperations.ensureReservedFolder that mimics the real
 * primitive's idempotency contract (PagePersistenceCoordinator's
 * runEnsureReservedFolder, exercised directly in
 * PagePersistenceCoordinator.ensureReservedFolder.test.ts): missing →
 * create once and remember it; already-present → return the same Folder
 * with no new creation. Lets these router-level tests assert the
 * required → ensure → use lifecycle (ensure happens, then open receives
 * exactly what ensure resolved to) without re-testing recreation
 * mechanics that already have dedicated Gate-level coverage.
 */
function createEnsureReservedFolderFake(initiallyPresent: ReservedFolderId[] = []) {
  const store = new Map<string, Folder>(
    initiallyPresent.map((id) => [id, { id: `folder-${id}` } as Folder])
  );
  let createCount = 0;

  const ensureReservedFolder = vi.fn(async (id: ReservedFolderId) => {
    const existing = store.get(id);
    if (existing) {
      return existing;
    }
    createCount += 1;
    const created = { id: `folder-${id}` } as Folder;
    store.set(id, created);
    return created;
  });

  return {
    ensureReservedFolder,
    deleteExternally: (id: ReservedFolderId) => store.delete(id),
    getCreateCount: () => createCount,
  };
}

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('NavigationRouter', () => {
  it.each([
    ['openArchive', 'archive'] as const,
    ['openInbox', 'inbox'] as const,
    ['openTemplates', 'templates'] as const,
  ])('%s ensures the missing %s reserved folder, then opens it', async (method, id) => {
    const openFolder = vi.fn();
    const fake = createEnsureReservedFolderFake();
    const navigation = createNavigationRouter({
      folderOperations: { open: openFolder, ensureReservedFolder: fake.ensureReservedFolder },
    });

    navigation[method]();
    await flushMicrotasks();

    expect(fake.ensureReservedFolder).toHaveBeenCalledWith(id);
    expect(fake.getCreateCount()).toBe(1);
    expect(openFolder).toHaveBeenCalledWith(`folder-${id}`);
  });

  it('opens an already-existing reserved folder without creating a duplicate', async () => {
    const openFolder = vi.fn();
    const fake = createEnsureReservedFolderFake(['archive']);
    const navigation = createNavigationRouter({
      folderOperations: { open: openFolder, ensureReservedFolder: fake.ensureReservedFolder },
    });

    navigation.openArchive();
    await flushMicrotasks();

    expect(fake.getCreateCount()).toBe(0);
    expect(openFolder).toHaveBeenCalledWith('folder-archive');
  });

  it('repeated opens of the same reserved folder remain idempotent', async () => {
    const openFolder = vi.fn();
    const fake = createEnsureReservedFolderFake();
    const navigation = createNavigationRouter({
      folderOperations: { open: openFolder, ensureReservedFolder: fake.ensureReservedFolder },
    });

    navigation.openInbox();
    await flushMicrotasks();
    navigation.openInbox();
    await flushMicrotasks();
    navigation.openInbox();
    await flushMicrotasks();

    expect(fake.getCreateCount()).toBe(1);
    expect(openFolder).toHaveBeenCalledTimes(3);
    expect(openFolder).toHaveBeenNthCalledWith(1, 'folder-inbox');
    expect(openFolder).toHaveBeenNthCalledWith(2, 'folder-inbox');
    expect(openFolder).toHaveBeenNthCalledWith(3, 'folder-inbox');
  });

  it('recreates a reserved folder that was deleted externally while the app was running, then opens it', async () => {
    const openFolder = vi.fn();
    const fake = createEnsureReservedFolderFake(['templates']);
    const navigation = createNavigationRouter({
      folderOperations: { open: openFolder, ensureReservedFolder: fake.ensureReservedFolder },
    });

    navigation.openTemplates();
    await flushMicrotasks();
    expect(fake.getCreateCount()).toBe(0); // present on disk/Vault, no recreation needed yet

    fake.deleteExternally('templates'); // simulates VaultSyncService reconciling an external delete
    navigation.openTemplates();
    await flushMicrotasks();

    expect(fake.getCreateCount()).toBe(1); // recreated exactly once, on demand
    expect(openFolder).toHaveBeenCalledTimes(2);
    expect(openFolder).toHaveBeenNthCalledWith(2, 'folder-templates');
  });

  it('openWorkspace shows the workspace filtered view directly, without touching FolderOperations', () => {
    const openFilteredView = vi.fn();
    const openFolder = vi.fn();
    const navigation = createNavigationRouter({
      folderOperations: { open: openFolder },
      workspace: { openFilteredView },
    });

    navigation.openWorkspace();

    expect(openFilteredView).toHaveBeenCalledWith({ kind: 'workspace' });
    expect(openFolder).not.toHaveBeenCalled();
  });

  it('openFavorites shows the favorites filtered view directly, without touching FolderOperations', () => {
    const openFilteredView = vi.fn();
    const openFolder = vi.fn();
    const navigation = createNavigationRouter({
      folderOperations: { open: openFolder },
      workspace: { openFilteredView },
    });

    navigation.openFavorites();

    expect(openFilteredView).toHaveBeenCalledWith({ kind: 'favorites' });
    expect(openFolder).not.toHaveBeenCalled();
  });

  it('openTag shows the tag filtered view with the given name, without touching FolderOperations', () => {
    const openFilteredView = vi.fn();
    const openFolder = vi.fn();
    const navigation = createNavigationRouter({
      folderOperations: { open: openFolder },
      workspace: { openFilteredView },
    });

    navigation.openTag('Project');

    expect(openFilteredView).toHaveBeenCalledWith({ kind: 'tag', tagName: 'Project' });
    expect(openFolder).not.toHaveBeenCalled();
  });
});

describe('NavigationRouter.back/forward (ADR-027)', () => {
  it('is a no-op at empty history', () => {
    const openPage = vi.fn();
    const history = createFakeHistory([]);
    const navigation = createNavigationRouter({
      pageOperations: { open: openPage },
      workspace: history as unknown as Workspace,
    });

    navigation.back();
    navigation.forward();

    expect(openPage).not.toHaveBeenCalled();
  });

  it('back() reopens the previous page and moves it to forwardStack', () => {
    const openPage = vi.fn();
    const getPage = vi.fn(() => ({ id: 'page-a' }) as Page);
    const history = createFakeHistory([{ type: 'page', id: 'page-a' }]);
    const navigation = createNavigationRouter({
      pageOperations: { open: openPage },
      vault: { getPage },
      workspace: history as unknown as Workspace,
    });

    navigation.back();

    expect(openPage).toHaveBeenCalledWith('page-a', { recordHistory: false });
    expect(history.backStack).toHaveLength(0);
  });

  it('forward() reopens the next page', () => {
    const openPage = vi.fn();
    const getPage = vi.fn(() => ({ id: 'page-b' }) as Page);
    const history = createFakeHistory([], [{ type: 'page', id: 'page-b' }]);
    const navigation = createNavigationRouter({
      pageOperations: { open: openPage },
      vault: { getPage },
      workspace: history as unknown as Workspace,
    });

    navigation.forward();

    expect(openPage).toHaveBeenCalledWith('page-b', { recordHistory: false });
    expect(history.forwardStack).toHaveLength(0);
  });

  it('multiple back() calls walk the stack one step at a time', () => {
    const openPage = vi.fn();
    const getPage = vi.fn(() => ({ id: 'irrelevant' }) as Page);
    const history = createFakeHistory([
      { type: 'page', id: 'page-a' },
      { type: 'page', id: 'page-b' },
      { type: 'page', id: 'page-c' },
    ]);
    const navigation = createNavigationRouter({
      pageOperations: { open: openPage },
      vault: { getPage },
      workspace: history as unknown as Workspace,
    });

    navigation.back();
    navigation.back();
    navigation.back();

    expect(openPage.mock.calls.map((call) => call[0])).toEqual([
      'page-c',
      'page-b',
      'page-a',
    ]);
    expect(history.canNavigateBack).toBe(false);
  });

  it('branching: forwardStack is not consulted or mutated by back() beyond the one entry it produces', () => {
    // Workspace.openPage()'s recordHistory:true branch owns clearing
    // forwardStack on a genuinely new navigation (ADR-027 Invariant 4) —
    // NavigationRouter's job here is only to prove back() pushes exactly
    // one entry onto forwardStack per call, not zero and not more.
    const openPage = vi.fn();
    const getPage = vi.fn(() => ({ id: 'page-a' }) as Page);
    const history = createFakeHistory(
      [{ type: 'page', id: 'page-a' }],
      [],
      { type: 'page', id: 'page-b' } // the view active before back() is called
    );
    const navigation = createNavigationRouter({
      pageOperations: { open: openPage },
      vault: { getPage },
      workspace: history as unknown as Workspace,
    });

    navigation.back();

    expect(history.forwardStack).toHaveLength(1);
  });

  it('skips a deleted page and lands on the next valid entry, without touching Application.openFallbackPage', () => {
    const openPage = vi.fn();
    const getPage = vi.fn((id: string) => (id === 'page-a' ? ({ id } as Page) : undefined));
    const history = createFakeHistory([
      { type: 'page', id: 'page-a' },
      { type: 'page', id: 'page-b-deleted' },
    ]);
    const navigation = createNavigationRouter({
      pageOperations: { open: openPage },
      vault: { getPage },
      workspace: history as unknown as Workspace,
    });

    navigation.back();

    expect(openPage).toHaveBeenCalledTimes(1);
    expect(openPage).toHaveBeenCalledWith('page-a', { recordHistory: false });
    expect(history.canNavigateBack).toBe(false);
  });

  it('a live draft (ADR-017, no Vault entry) is not treated as stale — back() returns to it', () => {
    const openPage = vi.fn();
    const getPage = vi.fn(() => undefined); // drafts are never in Vault
    const getDraft = vi.fn((id: string) =>
      id === 'draft-1' ? ({ folderId: null, type: 'note' } as ReturnType<PageOperations['getDraft']>) : undefined
    );
    const history = createFakeHistory([{ type: 'page', id: 'draft-1' }]);
    const navigation = createNavigationRouter({
      pageOperations: { open: openPage, getDraft },
      vault: { getPage },
      workspace: history as unknown as Workspace,
    });

    navigation.back();

    expect(openPage).toHaveBeenCalledTimes(1);
    expect(openPage).toHaveBeenCalledWith('draft-1', { recordHistory: false });
    expect(history.canNavigateBack).toBe(false);
  });

  it('skips a deleted folder the same way as a deleted page', () => {
    const openFolder = vi.fn();
    const getFolder = vi.fn(() => undefined);
    const history = createFakeHistory([{ type: 'folder', id: 'folder-deleted' }]);
    const navigation = createNavigationRouter({
      folderOperations: { open: openFolder },
      vault: { getFolder },
      workspace: history as unknown as Workspace,
    });

    navigation.back();

    expect(openFolder).not.toHaveBeenCalled();
    expect(history.canNavigateBack).toBe(false);
  });

  it('when every remaining entry is stale, back() empties the stack and commits nothing', () => {
    const openPage = vi.fn();
    const getPage = vi.fn(() => undefined);
    const history = createFakeHistory([
      { type: 'page', id: 'deleted-1' },
      { type: 'page', id: 'deleted-2' },
    ]);
    const navigation = createNavigationRouter({
      pageOperations: { open: openPage },
      vault: { getPage },
      workspace: history as unknown as Workspace,
    });

    navigation.back();

    expect(openPage).not.toHaveBeenCalled();
    expect(history.canNavigateBack).toBe(false);
  });

  it('handles mixed resource types in one traversal — page, then folder, then filtered view', () => {
    const openPage = vi.fn();
    const openFolder = vi.fn();
    const getPage = vi.fn(() => ({ id: 'page-a' }) as Page);
    const getFolder = vi.fn(() => ({ id: 'folder-a' }) as Folder);
    const history = createFakeHistory([
      { type: 'filtered-view', view: { kind: 'favorites' } },
      { type: 'folder', id: 'folder-a' },
      { type: 'page', id: 'page-a' },
    ]);
    const navigation = createNavigationRouter({
      folderOperations: { open: openFolder },
      pageOperations: { open: openPage },
      vault: { getPage, getFolder },
      workspace: history as unknown as Workspace,
    });

    navigation.back(); // page-a
    navigation.back(); // folder-a
    navigation.back(); // favorites

    expect(openPage).toHaveBeenCalledWith('page-a', { recordHistory: false });
    expect(openFolder).toHaveBeenCalledWith('folder-a', { recordHistory: false });
    expect(history.openFilteredView).toHaveBeenCalledWith(
      { kind: 'favorites' },
      { recordHistory: false }
    );
  });

  it('a filtered-view entry is never treated as stale', () => {
    const history = createFakeHistory([{ type: 'filtered-view', view: { kind: 'workspace' } }]);
    const navigation = createNavigationRouter({
      workspace: history as unknown as Workspace,
    });

    navigation.back();

    expect(history.openFilteredView).toHaveBeenCalledWith(
      { kind: 'workspace' },
      { recordHistory: false }
    );
    expect(history.canNavigateBack).toBe(false);
  });
});
