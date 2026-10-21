// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { QuiesceResult } from '@core/application/Application';
import { migrateRenamedRootState } from '@core/application/space/migrateRenamedRootState';
import type { SpaceFolderStatus } from '@core/vault/providers/probeSpaceFolder';
import { InMemoryVaultFileSystem } from '@core/vault/testing/InMemoryVaultFileSystem';
import { readSpaceIdFrom } from './readSpaceId';
import { renameActiveSpaceFolder, type RenameDeps } from './renameActiveSpace';
import { renameInactiveSpaceFolder, type InactiveRenameDeps } from './renameInactiveSpace';
import type { SpaceRegistryStorage } from './spaceRegistry';
import { useSpaceRegistry } from './useSpaceRegistry';

/**
 * The real registry hook, guard, identity reads and state migration over an in-memory "disk" that can rename a folder,
 * with the open Space represented by a stand-in Application whose every call is recorded. Proves what an inactive rename
 * does AND what it must not: the open Space is never closed, quiesced, switched or reopened.
 */
const ACTIVE = '/s/Notes';
const OTHER = '/s/Other';
const RENAMED = '/s/Journal';
const ACTIVE_ID = 'space-active';
const OTHER_ID = 'space-other';
const STABLE_PAGE = '0b1f6d9e-6c1a-4a39-9d3f-2f1c9a7e5a10';

class Disk extends InMemoryVaultFileSystem {
  private tree() {
    return (this as unknown as { files: Map<string, string> }).files;
  }
  renameTree(from: string, to: string): void {
    const files = this.tree();
    if (this.hasTree(to)) throw new Error('A folder with that name already exists');
    for (const [path, contents] of [...files]) {
      if (!path.startsWith(`${from}/`)) continue;
      files.delete(path);
      files.set(`${to}${path.slice(from.length)}`, contents);
    }
  }
  hasTree(path: string): boolean {
    return [...this.tree().keys()].some((candidate) => candidate.startsWith(`${path}/`));
  }
  snapshot(path: string): Record<string, string> {
    return Object.fromEntries([...this.tree()].filter(([candidate]) => candidate.startsWith(`${path}/`)));
  }
}

function seed(): Disk {
  return new Disk({
    [`${ACTIVE}/.clutter/workspace.json`]: JSON.stringify({ space: { version: 1, id: ACTIVE_ID } }),
    [`${ACTIVE}/Open.md`]: 'the open space',
    [`${OTHER}/.clutter/workspace.json`]: JSON.stringify({
      space: { version: 1, id: OTHER_ID, avatar: { type: 'emoji', emoji: '🍒' }, defaultCoverPosition: 'above', autoDeleteArchived: true },
      workspaceSession: {
        version: 1,
        navigation: { activeSidebarTab: 'notes', activeView: { type: 'page', id: `${OTHER}/plan.md` } },
        sidebar: { visible: true, collapsedSections: [], notes: { collapsedFolderIds: [] }, dailyNotes: { earlierExpanded: false, upcomingExpanded: false } },
      },
      foldState: { [`${OTHER}/plan.md`]: [1, 2], [STABLE_PAGE]: [3, 4] },
      preferredTemplates: [`${OTHER}/Templates/t.md`],
    }),
    [`${OTHER}/plan.md`]: '---\nid: plan\n---\nThe plan',
    [`${OTHER}/Assets/logo.png`]: 'PNG',
  });
}

function setup(options: { osRename?: (from: string, to: string) => void; quiesce?: () => Promise<QuiesceResult> } = {}) {
  const disk = seed();
  let stored = JSON.stringify({ paths: [ACTIVE, OTHER], activePath: ACTIVE });
  const storage: SpaceRegistryStorage = { getItem: () => stored, setItem: (_k, v) => void (stored = v) };
  const probe = async (path: string): Promise<SpaceFolderStatus> => (disk.hasTree(path) ? 'available' : 'missing');
  const view = renderHook(() => useSpaceRegistry({ probe, storage }));

  const application = {
    spaceId: ACTIVE_ID,
    quiesceForRename: vi.fn(async () => (options.quiesce ? options.quiesce() : ({ ok: true } as QuiesceResult))),
    close: vi.fn(async () => undefined),
  };
  const calls = { reopenActive: vi.fn(), recoverFromLost: vi.fn(), detach: vi.fn() };
  const doRename = async (path: string, name: string) => {
    const to = `/s/${name.trim()}`;
    try {
      (options.osRename ?? ((from, target) => disk.renameTree(from, target)))(path, to);
      return { path: to };
    } catch (error) {
      return { error: (error as Error).message };
    }
  };

  const inactiveDeps = (): InactiveRenameDeps => ({
    guard: view.result.current.lifecycle,
    activePath: () => view.result.current.registry.activePath,
    isRegistered: (path) => view.result.current.registry.paths.includes(path),
    probe,
    readSpaceId: (path) => readSpaceIdFrom(disk, path),
    destinationExists: async (path) => disk.hasTree(path),
    renameFolder: doRename,
    migrateState: (oldRoot, newRoot) => migrateRenamedRootState(disk, oldRoot, newRoot),
    renameEntry: (from, to) => view.result.current.renameInactiveSpace(from, to),
  });
  const activeDeps = (): RenameDeps => ({
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
    renameFolder: doRename,
    readSpaceId: (path) => readSpaceIdFrom(disk, path),
    destinationExists: async (path) => disk.hasTree(path),
    migrateState: (oldRoot, newRoot) => migrateRenamedRootState(disk, oldRoot, newRoot),
    reopenActive: calls.reopenActive,
    recoverFromLost: calls.recoverFromLost,
  });

  const renameInactive = async (path: string, name: string) => {
    let outcome!: Awaited<ReturnType<typeof renameInactiveSpaceFolder>>;
    await act(async () => {
      outcome = await renameInactiveSpaceFolder(inactiveDeps(), path, name);
    });
    return outcome;
  };
  const renameActive = async (name: string) => {
    let outcome!: Awaited<ReturnType<typeof renameActiveSpaceFolder>>;
    await act(async () => {
      outcome = await renameActiveSpaceFolder(activeDeps(), name);
    });
    return outcome;
  };

  return { disk, view, application, calls, renameInactive, renameActive, saved: () => JSON.parse(stored) };
}

describe('renaming an inactive Space, end to end', () => {
  it('renames the actual folder, moves its registry entry, and keeps its id, notes, assets, profile and settings', async () => {
    const { disk, view, renameInactive, saved } = setup();
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    act(() => view.result.current.confirmOpened());

    const outcome = await renameInactive(OTHER, 'Journal');

    expect(outcome).toEqual({ status: 'renamed', path: RENAMED, warnings: [] });
    // The actual folder.
    expect(disk.hasTree(OTHER)).toBe(false);
    expect(disk.getFileSync(`${RENAMED}/plan.md`)).toBe('---\nid: plan\n---\nThe plan');
    expect(disk.getFileSync(`${RENAMED}/Assets/logo.png`)).toBe('PNG');
    // The registry entry, in memory and saved; the active Space is where it was.
    expect(view.result.current.registry).toEqual({ paths: [ACTIVE, RENAMED], activePath: ACTIVE });
    expect(saved()).toEqual({ paths: [ACTIVE, RENAMED], activePath: ACTIVE });
    // The same Space: id, avatar and settings intact.
    expect(await readSpaceIdFrom(disk, RENAMED)).toBe(OTHER_ID);
    const state = JSON.parse(disk.getFileSync(`${RENAMED}/.clutter/workspace.json`)!);
    expect(state.space).toEqual({
      version: 1,
      id: OTHER_ID,
      avatar: { type: 'emoji', emoji: '🍒' },
      defaultCoverPosition: 'above',
      autoDeleteArchived: true,
    });
    // Saved state keyed by path-derived ids follows; a stable id is untouched.
    expect(state.workspaceSession.navigation.activeView).toEqual({ type: 'page', id: `${RENAMED}/plan.md` });
    expect(state.foldState).toEqual({ [`${RENAMED}/plan.md`]: [1, 2], [STABLE_PAGE]: [3, 4] });
    expect(state.preferredTemplates).toEqual([`${RENAMED}/Templates/t.md`]);
  });

  it('leaves the open Space completely alone: still open and unchanged, never quiesced, closed, switched or reopened', async () => {
    const { disk, view, application, calls, renameInactive } = setup();
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    act(() => view.result.current.confirmOpened());
    const before = disk.snapshot(ACTIVE);

    await renameInactive(OTHER, 'Journal');

    expect(application.quiesceForRename).not.toHaveBeenCalled();
    expect(application.close).not.toHaveBeenCalled();
    expect(calls.detach).not.toHaveBeenCalled();
    expect(calls.reopenActive).not.toHaveBeenCalled();
    expect(calls.recoverFromLost).not.toHaveBeenCalled();
    expect(view.result.current.registry.activePath).toBe(ACTIVE);
    expect(disk.snapshot(ACTIVE)).toEqual(before);
    expect(view.result.current.registry.pendingRename).toBeUndefined(); // the active rename's record is not involved
  });

  it('rejects an invalid name and a taken destination without touching anything', async () => {
    const { disk, view, renameInactive, saved } = setup();
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    act(() => view.result.current.confirmOpened());
    const registry = saved();
    const folder = disk.snapshot(OTHER);

    expect(await renameInactive(OTHER, 'a/b')).toEqual({ status: 'refused', reason: 'invalid-name' });
    expect(await renameInactive(OTHER, 'Notes')).toEqual({ status: 'refused', reason: 'name-taken' }); // the open Space's name

    expect(disk.snapshot(OTHER)).toEqual(folder);
    expect(saved()).toEqual(registry);
    expect(view.result.current.registry).toEqual(registry);
  });

  it('a failed filesystem rename leaves the folder and the registry exactly as they were, and is not retried or undone', async () => {
    const osRename = vi.fn(() => {
      throw new Error('Permission denied (os error 13)');
    });
    const { disk, view, renameInactive, saved } = setup({ osRename });
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    act(() => view.result.current.confirmOpened());
    const registry = saved();
    const folder = disk.snapshot(OTHER);

    const outcome = await renameInactive(OTHER, 'Journal');

    expect(outcome).toEqual({ status: 'failed', message: 'Permission denied (os error 13)' });
    expect(osRename).toHaveBeenCalledTimes(1);
    expect(disk.snapshot(OTHER)).toEqual(folder);
    expect(saved()).toEqual(registry);
    expect(view.result.current.lifecycle.active).toBeNull();
  });

  it('the open Space cannot be renamed through the inactive path', async () => {
    const { view, renameInactive } = setup();
    await waitFor(() => expect(view.result.current.ready).toBe(true));

    expect(await renameInactive(ACTIVE, 'Journal')).toEqual({ status: 'refused', reason: 'not-inactive' });
  });

  it('the open Space can still be renamed through the existing safe flow, before or after an inactive rename', async () => {
    const { disk, view, application, calls, renameInactive, renameActive } = setup();
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    act(() => view.result.current.confirmOpened());
    await renameInactive(OTHER, 'Journal');

    const outcome = await renameActive('Diary');

    expect(outcome).toEqual({ status: 'renamed', path: '/s/Diary', warnings: [] });
    expect(application.quiesceForRename).toHaveBeenCalledTimes(1);
    expect(application.close).toHaveBeenCalledTimes(1);
    expect(disk.hasTree(ACTIVE)).toBe(false);
    expect(view.result.current.registry).toEqual({ paths: ['/s/Diary', RENAMED], activePath: '/s/Diary' });
    expect(calls.recoverFromLost).not.toHaveBeenCalled();
  });

  describe('concurrency', () => {
    it('an inactive rename cannot start while an active rename is running, and the active one is unaffected', async () => {
      let release!: () => void;
      const { view, renameInactive, renameActive, disk } = setup({
        quiesce: () => new Promise<QuiesceResult>((resolve) => (release = () => resolve({ ok: true }))),
      });
      await waitFor(() => expect(view.result.current.ready).toBe(true));
      act(() => view.result.current.confirmOpened());

      let active!: Promise<unknown>;
      act(() => {
        active = renameActive('Diary');
      });
      await waitFor(() => expect(release).toBeDefined());

      expect(await renameInactive(OTHER, 'Journal')).toEqual({ status: 'refused', reason: 'busy' });
      expect(disk.hasTree(OTHER)).toBe(true); // nothing moved

      await act(async () => {
        release();
        await active;
      });
      expect(view.result.current.registry.activePath).toBe('/s/Diary');
      expect(view.result.current.lifecycle.active).toBeNull();
    });

    it('while an inactive rename runs, an active rename, a switch, a selection and a removal are all refused', async () => {
      let finish!: () => void;
      const osRename = vi.fn();
      const { disk, view, renameActive, renameInactive, application } = setup({ osRename });
      await waitFor(() => expect(view.result.current.ready).toBe(true));
      act(() => view.result.current.confirmOpened());

      // Hold the inactive rename inside its folder rename by making the registry's guard visible mid-flight.
      const slow: InactiveRenameDeps = {
        guard: view.result.current.lifecycle,
        activePath: () => view.result.current.registry.activePath,
        isRegistered: (path) => view.result.current.registry.paths.includes(path),
        probe: async () => 'available',
        readSpaceId: (path) => readSpaceIdFrom(disk, path),
        destinationExists: async () => false,
        renameFolder: () => new Promise((resolve) => (finish = () => resolve({ path: RENAMED }))),
        migrateState: async () => true,
        renameEntry: () => true,
      };
      let running!: Promise<unknown>;
      act(() => {
        running = renameInactiveSpaceFolder(slow, OTHER, 'Journal');
      });
      await waitFor(() => expect(finish).toBeDefined());

      expect((await renameActive('Diary')).status).toBe('refused');
      expect(await renameInactive(OTHER, 'Another')).toEqual({ status: 'refused', reason: 'busy' });
      let switched = true;
      let selected = true;
      await act(async () => {
        switched = await view.result.current.switchSpace(OTHER);
        selected = await view.result.current.selectSpace(OTHER);
        view.result.current.removeSpace(OTHER);
      });
      expect(switched).toBe(false);
      expect(selected).toBe(false);
      expect(view.result.current.registry.paths).toContain(OTHER);
      expect(application.quiesceForRename).not.toHaveBeenCalled();

      await act(async () => {
        finish();
        await running;
      });
      expect(view.result.current.lifecycle.active).toBeNull();
      expect(osRename).not.toHaveBeenCalled();
    });
  });
});
