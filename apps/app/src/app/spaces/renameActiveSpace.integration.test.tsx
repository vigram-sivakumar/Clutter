// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { QuiesceResult } from '@core/application/Application';
import { migrateRenamedRootState } from '@core/application/space/migrateRenamedRootState';
import type { SpaceFolderStatus } from '@core/vault/providers/probeSpaceFolder';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { readSpaceIdFrom } from './readSpaceId';
import { renameActiveSpaceFolder, type RenameDeps } from './renameActiveSpace';
import type { SpaceRegistryStorage } from './spaceRegistry';
import { useSpaceRegistry } from './useSpaceRegistry';

/**
 * The real registry hook, the real orchestration, the real state migration and the real identity reads, over an
 * in-memory "disk" that can rename a folder. Only the Application and the OS rename are stand-ins. This is the
 * sequence the Space settings page triggers, end to end, without the page.
 */
const OLD = '/s/Notes';
const NEW = '/s/Journal';
const ID = 'space-1';
const STABLE_PAGE = '0b1f6d9e-6c1a-4a39-9d3f-2f1c9a7e5a10';

class Disk extends InMemoryVaultFileSystem {
  /** The OS rename: every file under `from` is now under `to`. Refuses to overwrite. */
  renameTree(from: string, to: string): void {
    const files = (this as unknown as { files: Map<string, string> }).files;
    if ([...files.keys()].some((path) => path.startsWith(`${to}/`))) throw new Error('A folder with that name already exists');
    for (const [path, contents] of [...files]) {
      if (!path.startsWith(`${from}/`)) continue;
      files.delete(path);
      files.set(`${to}${path.slice(from.length)}`, contents);
    }
  }
  has(path: string): boolean {
    return this.hasFileSync(path);
  }
}

function seedDisk(): Disk {
  return new Disk({
    [`${OLD}/.clutter/workspace.json`]: JSON.stringify({
      space: { version: 1, id: ID, avatar: { type: 'emoji', emoji: '🌿' }, defaultNoteFolderId: `${OLD}/Projects` },
      workspaceSession: {
        version: 1,
        navigation: { activeSidebarTab: 'notes', activeView: { type: 'page', id: `${OLD}/Projects/plan.md` } },
        sidebar: { visible: true, collapsedSections: [], notes: { collapsedFolderIds: [`${OLD}/Archive`] }, dailyNotes: { earlierExpanded: false, upcomingExpanded: false } },
      },
      foldState: { [`${OLD}/Projects/plan.md`]: [1, 4], [STABLE_PAGE]: [2, 3] },
    }),
    [`${OLD}/Projects/plan.md`]: '---\nid: plan\n---\nThe plan',
    [`${OLD}/Assets/logo.png`]: 'PNG',
  });
}

function setup(options: {
  quiesce?: () => Promise<QuiesceResult>;
  osRename?: (from: string, to: string) => void;
  taken?: boolean;
  writableRegistryAtEnd?: boolean;
} = {}) {
  const disk = seedDisk();
  let stored = JSON.stringify({ paths: [OLD, '/s/Other'], activePath: OLD });
  let writes = 0;
  const failFinalWrite = options.writableRegistryAtEnd === false;
  const storage: SpaceRegistryStorage = {
    getItem: () => stored,
    setItem: (_key, value) => {
      writes++;
      // The first write records the pending rename; the next is the final one (new path, record cleared).
      if (failFinalWrite && writes > 1) throw new Error('full');
      stored = value;
    },
  };
  const probe = async (path: string): Promise<SpaceFolderStatus> => (disk.has(`${path}/.clutter/workspace.json`) ? 'available' : 'missing');
  const view = renderHook(() => useSpaceRegistry({ probe, storage }));

  const application = {
    spaceId: ID,
    quiesceForRename: vi.fn(async () => (options.quiesce ? options.quiesce() : ({ ok: true } as QuiesceResult))),
    close: vi.fn(async () => undefined),
  };
  const calls = { reopenActive: vi.fn(), recoverFromLost: vi.fn(), detach: vi.fn() };
  const deps = (): RenameDeps => ({
    guard: view.result.current.lifecycle,
    activePath: () => view.result.current.registry.activePath,
    application: () => application,
    detachApplication: calls.detach,
    registry: {
      beginRename: (to, id) => view.result.current.beginRename(to, id),
      completeRename: (to) => view.result.current.completeRename(to),
      abandonRename: () => view.result.current.abandonRename(),
      hasPendingRename: () => view.result.current.registry.pendingRename !== undefined,
    },
    renameFolder: async (path, name) => {
      const to = `/s/${name.trim()}`;
      try {
        (options.osRename ?? ((from, target) => disk.renameTree(from, target)))(path, to);
        return { path: to };
      } catch (error) {
        return { error: (error as Error).message };
      }
    },
    readSpaceId: (path) => readSpaceIdFrom(disk, path),
    destinationExists: async () => options.taken ?? false,
    migrateState: (oldRoot, newRoot) => migrateRenamedRootState(disk, oldRoot, newRoot),
    reopenActive: calls.reopenActive,
    recoverFromLost: calls.recoverFromLost,
  });

  const rename = async (name: string) => {
    let outcome!: Awaited<ReturnType<typeof renameActiveSpaceFolder>>;
    await act(async () => {
      outcome = await renameActiveSpaceFolder(deps(), name);
    });
    return outcome;
  };
  const savedRegistry = () => JSON.parse(stored);

  return { disk, view, application, calls, rename, savedRegistry, deps };
}

describe('renaming the open Space, end to end', () => {
  it('renames the real folder, moves the registry to the new path, and keeps the Space id, notes, assets and saved UI state', async () => {
    const { disk, view, rename, savedRegistry, calls } = setup();
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    act(() => view.result.current.confirmOpened());

    const outcome = await rename('Journal');

    expect(outcome).toEqual({ status: 'renamed', path: NEW, warnings: [] });
    // The actual folder.
    expect(disk.has(`${OLD}/Projects/plan.md`)).toBe(false);
    expect(disk.getFileSync(`${NEW}/Projects/plan.md`)).toBe('---\nid: plan\n---\nThe plan');
    expect(disk.getFileSync(`${NEW}/Assets/logo.png`)).toBe('PNG');
    // The registry, in memory and in storage, with no record left.
    expect(view.result.current.registry).toEqual({ paths: [NEW, '/s/Other'], activePath: NEW });
    expect(savedRegistry()).toEqual({ paths: [NEW, '/s/Other'], activePath: NEW });
    // The Space is the same Space.
    expect(await readSpaceIdFrom(disk, NEW)).toBe(ID);
    const state = JSON.parse(disk.getFileSync(`${NEW}/.clutter/workspace.json`)!);
    expect(state.space).toMatchObject({ id: ID, avatar: { type: 'emoji', emoji: '🌿' }, defaultNoteFolderId: `${NEW}/Projects` });
    // Saved UI state follows the renamed ids; a stable id is untouched.
    expect(state.workspaceSession.navigation.activeView).toEqual({ type: 'page', id: `${NEW}/Projects/plan.md` });
    expect(state.workspaceSession.sidebar.notes.collapsedFolderIds).toEqual([`${NEW}/Archive`]);
    expect(state.foldState).toEqual({ [`${NEW}/Projects/plan.md`]: [1, 4], [STABLE_PAGE]: [2, 3] });
    expect(calls.reopenActive).not.toHaveBeenCalled(); // the registry's new path is what opens it
    expect(view.result.current.lifecycle.active).toBeNull();
  });

  it('an invalid name is refused without closing the current Space or touching anything', async () => {
    const { disk, view, rename, application, savedRegistry } = setup();
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    const before = savedRegistry();

    expect(await rename('a/b')).toEqual({ status: 'refused', reason: 'invalid-name' });

    expect(application.close).not.toHaveBeenCalled();
    expect(disk.has(`${OLD}/Projects/plan.md`)).toBe(true);
    expect(savedRegistry()).toEqual(before);
  });

  it('a name that is already taken is refused without closing the current Space', async () => {
    const { disk, view, rename, application, savedRegistry } = setup({ taken: true });
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    const before = savedRegistry();

    expect(await rename('Journal')).toEqual({ status: 'refused', reason: 'name-taken' });

    expect(application.quiesceForRename).not.toHaveBeenCalled();
    expect(application.close).not.toHaveBeenCalled();
    expect(disk.has(`${OLD}/Projects/plan.md`)).toBe(true);
    expect(savedRegistry()).toEqual(before);
  });

  it('a failed quiescence leaves the Application usable: nothing closed, the record cleared, the registry as it was', async () => {
    const { disk, view, rename, application, savedRegistry, calls } = setup({ quiesce: async () => ({ ok: false, reason: 'unsaved' }) });
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    const before = savedRegistry();

    expect(await rename('Journal')).toEqual({ status: 'refused', reason: 'unsaved' });

    expect(application.close).not.toHaveBeenCalled();
    expect(calls.detach).not.toHaveBeenCalled();
    expect(view.result.current.registry.pendingRename).toBeUndefined();
    expect(savedRegistry()).toEqual(before);
    expect(disk.has(`${OLD}/Projects/plan.md`)).toBe(true);
    expect(view.result.current.lifecycle.active).toBeNull();
  });

  it('a filesystem rename failure leaves the folder alone and reopens the original Space', async () => {
    const { disk, view, rename, calls, savedRegistry } = setup({
      osRename: () => {
        throw new Error('Permission denied (os error 13)');
      },
    });
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    const before = savedRegistry();

    const outcome = await rename('Journal');

    expect(outcome).toEqual({ status: 'failed', message: 'Permission denied (os error 13)', reopened: true });
    expect(calls.reopenActive).toHaveBeenCalledOnce();
    expect(calls.recoverFromLost).not.toHaveBeenCalled();
    expect(disk.has(`${OLD}/Projects/plan.md`)).toBe(true);
    expect(view.result.current.registry).toEqual({ paths: [OLD, '/s/Other'], activePath: OLD });
    expect(savedRegistry()).toEqual(before);
    expect(view.result.current.lifecycle.active).toBeNull();
  });

  it('a failure after the folder has moved never opens the old path or renames the folder back, and keeps the way to recover', async () => {
    const { disk, view, rename, calls, savedRegistry } = setup({ writableRegistryAtEnd: false });
    await waitFor(() => expect(view.result.current.ready).toBe(true));

    const outcome = await rename('Journal');

    expect(outcome).toEqual({ status: 'renamed', path: NEW, warnings: ['registry-not-saved'] });
    // The folder stays where it was moved, and the old path is never reopened.
    expect(disk.getFileSync(`${NEW}/Projects/plan.md`)).toBeDefined();
    expect(disk.has(`${OLD}/Projects/plan.md`)).toBe(false);
    expect(calls.reopenActive).not.toHaveBeenCalled();
    // Storage still holds the record and the old path: the next launch finishes the rename.
    expect(savedRegistry()).toMatchObject({ activePath: OLD, pendingRename: { from: OLD, to: NEW, spaceId: ID } });
    // This session follows the new path, so nothing can go back.
    expect(view.result.current.registry.activePath).toBe(NEW);
  });

  it('a Space that cannot be seen at its new path is not opened: recovery takes over and the folder is not renamed back', async () => {
    const { disk, view, calls, deps, savedRegistry } = setup();
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    const base = deps();
    const unseen: RenameDeps = { ...base, readSpaceId: async (path) => (path === NEW ? null : readSpaceIdFrom(disk, path)) };

    let outcome!: Awaited<ReturnType<typeof renameActiveSpaceFolder>>;
    await act(async () => {
      outcome = await renameActiveSpaceFolder(unseen, 'Journal');
    });

    expect(outcome.status).toBe('recovery');
    expect(calls.recoverFromLost).toHaveBeenCalledWith(OLD);
    expect(disk.getFileSync(`${NEW}/Projects/plan.md`)).toBeDefined();
    expect(savedRegistry().pendingRename).toBeDefined();
  });

  it('while a rename runs, nothing else can start: a second rename, a switch, a selection and a removal are all refused', async () => {
    let release!: () => void;
    const { view, rename, application } = setup({
      quiesce: () => new Promise<QuiesceResult>((resolve) => (release = () => resolve({ ok: true }))),
    });
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    act(() => view.result.current.confirmOpened());

    let first!: Promise<unknown>;
    act(() => {
      first = rename('Journal');
    });
    await waitFor(() => expect(application.quiesceForRename).toHaveBeenCalled());

    expect(await rename('Diary')).toEqual({ status: 'refused', reason: 'busy' });
    let switched = true;
    let selected = true;
    await act(async () => {
      switched = await view.result.current.switchSpace('/s/Other');
      selected = await view.result.current.selectSpace('/s/Other');
      view.result.current.removeSpace('/s/Other');
    });
    expect(switched).toBe(false);
    expect(selected).toBe(false);
    expect(view.result.current.registry.paths).toContain('/s/Other');
    expect(application.quiesceForRename).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
      await first;
    });
    expect(view.result.current.lifecycle.active).toBeNull();
  });

  it('the inactive-Space flow and the removal flow are unaffected: another Space can be removed afterwards', async () => {
    const { view, rename } = setup();
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    act(() => view.result.current.confirmOpened());
    await rename('Journal');

    act(() => view.result.current.removeSpace('/s/Other'));

    expect(view.result.current.registry).toEqual({ paths: [NEW], activePath: NEW });
  });
});

