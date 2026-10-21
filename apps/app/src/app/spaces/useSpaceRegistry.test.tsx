// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SpaceFolderStatus } from '../../core/vault/providers/probeSpaceFolder';
import type { SpaceRegistryStorage } from './spaceRegistry';
import { useSpaceRegistry } from './useSpaceRegistry';
import type { SpaceIdReading } from './reconcilePendingRename';

function memoryStorage(initial?: object): SpaceRegistryStorage & { value: string | null } {
  const store = {
    value: initial ? JSON.stringify(initial) : null,
    getItem: () => store.value,
    setItem: (_key: string, value: string) => {
      store.value = value;
    },
  };
  return store;
}

async function setup(options: {
  stored?: object;
  probe?: (path: string) => Promise<SpaceFolderStatus>;
  pick?: () => Promise<string | null>;
  readSpaceId?: (path: string) => Promise<SpaceIdReading>;
  migrateState?: (oldRoot: string, newRoot: string) => Promise<boolean>;
}) {
  const storage = memoryStorage(options.stored);
  const probe = options.probe ?? (async (): Promise<SpaceFolderStatus> => 'available');
  const view = renderHook(() =>
    useSpaceRegistry({ defaultPath: '/Default', probe, pick: options.pick, storage, readSpaceId: options.readSpaceId, migrateState: options.migrateState })
  );
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  return { ...view, storage };
}

describe('useSpaceRegistry', () => {
  it('choosing a folder changes nothing: no registration, no active Space, nothing persisted', async () => {
    const { result, storage } = await setup({ pick: async () => '/Picked/Notes/' });
    const before = result.current.registry;

    let chosen: string | null = null;
    await act(async () => {
      chosen = await result.current.chooseSpace!();
    });

    expect(chosen).toBe('/Picked/Notes');
    expect(result.current.registry).toBe(before);
    expect(storage.value).toBeNull();
  });

  it('registers and activates a confirmed folder, persisting only once it has opened', async () => {
    const { result, storage } = await setup({});

    await act(async () => void (await result.current.switchSpace('/Picked/Notes')));

    expect(result.current.registry).toEqual({
      paths: ['/Default', '/Picked/Notes'],
      activePath: '/Picked/Notes',
    });
    expect(storage.value).toBeNull();

    act(() => result.current.confirmOpened());
    expect(JSON.parse(storage.value!)).toEqual(result.current.registry);
  });

  it('chooses nothing when the picker is cancelled', async () => {
    const { result } = await setup({ pick: async () => null });
    const before = result.current.registry;

    let chosen: string | null = 'x';
    await act(async () => {
      chosen = await result.current.chooseSpace!();
    });

    expect(chosen).toBeNull();
    expect(result.current.registry).toBe(before);
    expect(result.current.notice).toBeNull();
  });

  it('activates an already registered Space instead of registering it twice', async () => {
    const { result } = await setup({
      stored: { paths: ['/Default', '/Other'], activePath: '/Default' },
    });

    await act(async () => void (await result.current.switchSpace('/Other/')));

    expect(result.current.registry).toEqual({ paths: ['/Default', '/Other'], activePath: '/Other' });
  });

  it('refuses an unavailable confirmed folder with a message and keeps the active Space', async () => {
    const probe = vi.fn(async (path: string): Promise<SpaceFolderStatus> => (path === '/Default' ? 'available' : 'missing'));
    const { result } = await setup({ probe });

    let accepted = true;
    await act(async () => {
      accepted = await result.current.switchSpace('/Gone');
    });

    expect(accepted).toBe(false);
    expect(result.current.registry).toEqual({ paths: ['/Default'], activePath: '/Default' });
    expect(result.current.notice?.text).toContain('/Gone');
  });

  it('returns to the previous Space when the confirmed one fails to open', async () => {
    const { result } = await setup({});
    act(() => result.current.confirmOpened());

    await act(async () => void (await result.current.switchSpace('/Bad')));
    expect(result.current.registry.activePath).toBe('/Bad');

    let reverted = false;
    act(() => {
      reverted = result.current.openFailed('boom');
    });

    expect(reverted).toBe(true);
    expect(result.current.registry).toEqual({ paths: ['/Default'], activePath: '/Default' });
    expect(result.current.notice?.text).toContain('boom');
  });

  it('does not report a revert when nothing had opened yet', async () => {
    const { result } = await setup({});
    expect(result.current.openFailed('boom')).toBe(false);
  });

  it('restores the stored active Space at startup', async () => {
    const { result } = await setup({
      stored: { paths: ['/Default', '/Other'], activePath: '/Other' },
    });
    expect(result.current.registry.activePath).toBe('/Other');
  });

  it('has no chooseSpace without a folder picker', async () => {
    const { result } = await setup({});
    expect(result.current.chooseSpace).toBeUndefined();
  });

  it('with no default and nothing stored, is ready with an empty registry and probes nothing', async () => {
    const storage = memoryStorage();
    const probe = vi.fn(async (): Promise<SpaceFolderStatus> => 'available');
    const view = renderHook(() => useSpaceRegistry({ probe, storage }));
    await waitFor(() => expect(view.result.current.ready).toBe(true));

    expect(view.result.current.registry).toEqual({ paths: [], activePath: null });
    expect(probe).not.toHaveBeenCalled();
    expect(storage.value).toBeNull();
  });

  it('reports a confirmed-missing active Space, leaving the registry and storage untouched', async () => {
    const stored = { paths: ['/Gone'], activePath: '/Gone' };
    const { result, storage } = await setup({ stored, probe: async () => 'missing' });

    expect(result.current.activeSpaceMissing).toBe(true);
    expect(result.current.registry).toEqual(stored);
    expect(JSON.parse(storage.value!)).toEqual(stored);
    expect(result.current.notice).toBeNull();
  });

  it('does not report a missing Space when the active one is merely unavailable (e.g. permission denied)', async () => {
    const stored = { paths: ['/Locked'], activePath: '/Locked' };
    const { result } = await setup({ stored, probe: async () => 'unavailable' });

    expect(result.current.activeSpaceMissing).toBe(false);
    expect(result.current.registry).toEqual(stored);
  });

  it('never activates another registered Space when the active one is missing, and preserves every entry', async () => {
    const stored = { paths: ['/Gone', '/Other'], activePath: '/Gone' };
    const probe = vi.fn(async (path: string): Promise<SpaceFolderStatus> => (path === '/Gone' ? 'missing' : 'available'));
    const { result, storage } = await setup({ stored, probe });

    expect(result.current.activeSpaceMissing).toBe(true);
    expect(result.current.registry).toEqual(stored);
    expect(JSON.parse(storage.value!)).toEqual(stored);
    expect(result.current.notice).toBeNull();
    // The other entry may be probed (for the selector's availability) but is never selected or opened.
    expect(probe).toHaveBeenCalledWith('/Gone');
    expect(result.current.registry.activePath).toBe('/Gone');

    // And nothing persists a different active path until the user opens a Space.
    expect(JSON.parse(storage.value!).activePath).toBe('/Gone');
  });

  it('does not fall back when the active Space is merely unavailable either, leaving it to the open error', async () => {
    const stored = { paths: ['/Locked', '/Other'], activePath: '/Locked' };
    const { result, storage } = await setup({
      stored,
      probe: async (path) => (path === '/Locked' ? 'unavailable' : 'available'),
    });

    expect(result.current.activeSpaceMissing).toBe(false);
    expect(result.current.registry).toEqual(stored);
    expect(JSON.parse(storage.value!)).toEqual(stored);
  });

  describe('selectSpace / cancelSelection', () => {
    it('activates an openable folder but persists nothing until confirmOpened', async () => {
      const empty = memoryStorage();
      const view = renderHook(() => useSpaceRegistry({ probe: async () => 'available', storage: empty }));
      await waitFor(() => expect(view.result.current.ready).toBe(true));

      let accepted = false;
      await act(async () => {
        accepted = await view.result.current.selectSpace('/Picked/Notes');
      });

      expect(accepted).toBe(true);
      expect(view.result.current.registry).toEqual({ paths: ['/Picked/Notes'], activePath: '/Picked/Notes' });
      expect(empty.value).toBeNull();
      act(() => view.result.current.confirmOpened());
      expect(JSON.parse(empty.value!)).toEqual({ paths: ['/Picked/Notes'], activePath: '/Picked/Notes' });
    });

    it('puts the previous (empty) registry back on cancelSelection', async () => {
      const storage = memoryStorage();
      const view = renderHook(() => useSpaceRegistry({ probe: async () => 'available', storage }));
      await waitFor(() => expect(view.result.current.ready).toBe(true));

      await act(async () => {
        await view.result.current.selectSpace('/Picked/Notes');
      });
      act(() => view.result.current.cancelSelection());

      expect(view.result.current.registry).toEqual({ paths: [], activePath: null });
      expect(storage.value).toBeNull();
    });

    it('refuses an unopenable folder without changing anything', async () => {
      const storage = memoryStorage();
      const view = renderHook(() => useSpaceRegistry({ probe: async () => 'unavailable', storage }));
      await waitFor(() => expect(view.result.current.ready).toBe(true));

      let accepted = true;
      await act(async () => {
        accepted = await view.result.current.selectSpace('/Locked');
      });

      expect(accepted).toBe(false);
      expect(view.result.current.registry).toEqual({ paths: [], activePath: null });
      expect(view.result.current.notice).not.toBeNull();
    });

    it('lets the configured Space that was reported missing be chosen again, restoring the report on cancel', async () => {
      const stored = { paths: ['/Gone'], activePath: '/Gone' };
      const storage = memoryStorage(stored);
      let status: SpaceFolderStatus = 'missing';
      const view = renderHook(() => useSpaceRegistry({ probe: async () => status, storage }));
      await waitFor(() => expect(view.result.current.activeSpaceMissing).toBe(true));

      status = 'available';
      await act(async () => {
        await view.result.current.selectSpace('/Gone');
      });
      expect(view.result.current.activeSpaceMissing).toBe(false);
      expect(view.result.current.registry).toEqual(stored);

      act(() => view.result.current.cancelSelection());
      expect(view.result.current.activeSpaceMissing).toBe(true);
      expect(view.result.current.registry).toEqual(stored);
    });
  });

  it('tells the user when the registry could not be saved, leaving the Space open', async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    const view = renderHook(() => useSpaceRegistry({ defaultPath: '/Default', probe: async () => 'available', storage }));
    await waitFor(() => expect(view.result.current.ready).toBe(true));

    act(() => view.result.current.confirmOpened());

    expect(view.result.current.notice?.text).toContain("won’t be reopened");
    expect(view.result.current.registry.activePath).toBe('/Default');
  });

  describe('availability of the other registered Spaces', () => {
    const stored = { paths: ['/A', '/Gone', '/Locked', '/B'], activePath: '/A' };
    const statusOf = (path: string): SpaceFolderStatus =>
      path === '/Gone' ? 'missing' : path === '/Locked' ? 'unavailable' : 'available';

    it('lists only confirmed-missing folders — a permission or scope failure is not "missing"', async () => {
      const { result } = await setup({ stored, probe: async (path) => statusOf(path) });
      await waitFor(() => expect(result.current.missingPaths.size).toBe(1));

      expect([...result.current.missingPaths]).toEqual(['/Gone']);
    });

    it('never includes the active Space, whose state belongs to the open/loss lifecycle', async () => {
      const { result } = await setup({ stored, probe: async () => 'missing' });
      await waitFor(() => expect(result.current.missingPaths.size).toBe(3));

      expect(result.current.missingPaths.has('/A')).toBe(false);
    });

    it('keeps every entry in the registry and in storage, and activates nothing', async () => {
      const { result, storage } = await setup({ stored, probe: async (path) => statusOf(path) });
      await waitFor(() => expect(result.current.missingPaths.size).toBe(1));

      expect(result.current.registry).toEqual(stored);
      expect(JSON.parse(storage.value!)).toEqual(stored);
    });

    it('picks up a folder deleted (or restored) later when asked to refresh', async () => {
      let gone = false;
      const { result } = await setup({
        stored,
        probe: async (path) => (path === '/B' && gone ? 'missing' : 'available'),
      });
      expect(result.current.missingPaths.size).toBe(0);

      gone = true;
      await act(() => result.current.refreshAvailability());
      expect([...result.current.missingPaths]).toEqual(['/B']);

      gone = false;
      await act(() => result.current.refreshAvailability());
      expect(result.current.missingPaths.size).toBe(0);
    });

    it('does not re-render when a refresh finds nothing new', async () => {
      const { result } = await setup({ stored, probe: async (path) => statusOf(path) });
      await waitFor(() => expect(result.current.missingPaths.size).toBe(1));
      const before = result.current.missingPaths;

      await act(() => result.current.refreshAvailability());

      expect(result.current.missingPaths).toBe(before);
    });
  });

  describe('fallbackCandidates', () => {
    const stored = { paths: ['/A', '/B', '/C', '/D'], activePath: '/B' };

    it('lists the other Spaces in registry order, starting after the lost one and wrapping around', async () => {
      const { result } = await setup({ stored, probe: async () => 'available' });
      expect(await result.current.fallbackCandidates('/B')).toEqual(['/C', '/D', '/A']);
      expect(await result.current.fallbackCandidates('/D')).toEqual(['/A', '/B', '/C']);
      expect(await result.current.fallbackCandidates('/A')).toEqual(['/B', '/C', '/D']);
    });

    it('offers only folders that are available right now — never a missing or inaccessible one', async () => {
      const status: Record<string, SpaceFolderStatus> = {
        '/A': 'available',
        '/B': 'missing',
        '/C': 'unavailable',
        '/D': 'missing',
      };
      const { result } = await setup({ stored, probe: async (path) => status[path]! });
      expect(await result.current.fallbackCandidates('/B')).toEqual(['/A']);
    });

    it('offers nothing when no other Space is valid, and changes and persists nothing either way', async () => {
      const { result, storage } = await setup({ stored, probe: async () => 'missing' });
      expect(await result.current.fallbackCandidates('/B')).toEqual([]);
      expect(result.current.registry).toEqual(stored);
      expect(JSON.parse(storage.value!)).toEqual(stored);
    });

    it('treats an unregistered lost path as having no position: the whole registry, in order', async () => {
      const { result } = await setup({ stored, probe: async () => 'available' });
      expect(await result.current.fallbackCandidates('/Elsewhere')).toEqual(['/A', '/B', '/C', '/D']);
    });
  });

  describe('chooseSpace with an accept() guard', () => {
    it('refuses a picked folder with a notice, without probing, activating or persisting anything', async () => {
      const storage = memoryStorage({ paths: ['/A'], activePath: '/A' });
      const probe = vi.fn(async (): Promise<SpaceFolderStatus> => 'available');
      const view = renderHook(() =>
        useSpaceRegistry({
          probe,
          storage,
          pick: async () => '/Home',
          accept: async () => 'Not allowed here.',
        })
      );
      await waitFor(() => expect(view.result.current.ready).toBe(true));
      probe.mockClear();

      let chosen: string | null = 'x';
      await act(async () => {
        chosen = await view.result.current.chooseSpace!();
      });

      expect(chosen).toBeNull();
      expect(view.result.current.notice?.text).toBe('Not allowed here.');
      expect(view.result.current.registry).toEqual({ paths: ['/A'], activePath: '/A' });
      expect(probe).not.toHaveBeenCalledWith('/Home');
    });

    it('returns the folder when accept() allows it, still without activating it', async () => {
      const storage = memoryStorage({ paths: ['/A'], activePath: '/A' });
      const view = renderHook(() =>
        useSpaceRegistry({
          probe: async () => 'available',
          storage,
          pick: async () => '/B',
          accept: async () => null,
        })
      );
      await waitFor(() => expect(view.result.current.ready).toBe(true));

      let chosen: string | null = null;
      await act(async () => {
        chosen = await view.result.current.chooseSpace!();
      });

      expect(chosen).toBe('/B');
      expect(view.result.current.registry.activePath).toBe('/A');
    });
  });

  describe('re-pointing and forgetting a missing Space', () => {
    const stored = { paths: ['/A', '/Gone', '/B'], activePath: '/A' };

    it('removeSpace forgets only that entry, remembered at once onto the last opened registry', async () => {
      const { result, storage } = await setup({ stored });
      act(() => result.current.confirmOpened());

      act(() => result.current.removeSpace('/Gone'));

      expect(result.current.registry).toEqual({ paths: ['/A', '/B'], activePath: '/A' });
      expect(JSON.parse(storage.value!)).toEqual({ paths: ['/A', '/B'], activePath: '/A' });
    });

    it('removeSpace never persists a Space whose switch is still in flight', async () => {
      const { result, storage } = await setup({ stored });
      act(() => result.current.confirmOpened());
      await act(async () => void (await result.current.switchSpace('/B')));

      act(() => result.current.removeSpace('/Gone'));

      expect(JSON.parse(storage.value!)).toEqual({ paths: ['/A', '/B'], activePath: '/A' });
    });

    it('removeSpace refuses the active Space and ignores an unregistered path', async () => {
      const { result } = await setup({ stored });
      const before = result.current.registry;

      act(() => result.current.removeSpace('/A'));
      act(() => result.current.removeSpace('/nope'));

      expect(result.current.registry).toBe(before);
    });

    it('switchSpace with replaces re-points that entry in place, persisted only once the Space has opened', async () => {
      const { result, storage } = await setup({ stored });
      act(() => result.current.confirmOpened());
      const before = storage.value;

      await act(async () => void (await result.current.switchSpace('/Moved', '/Gone')));

      expect(result.current.registry).toEqual({ paths: ['/A', '/Moved', '/B'], activePath: '/Moved' });
      expect(storage.value).toBe(before);
      act(() => result.current.confirmOpened());
      expect(JSON.parse(storage.value!)).toEqual({ paths: ['/A', '/Moved', '/B'], activePath: '/Moved' });
    });

    it('a failed open puts the replaced entry back', async () => {
      const { result } = await setup({ stored });
      act(() => result.current.confirmOpened());
      await act(async () => void (await result.current.switchSpace('/Moved', '/Gone')));

      act(() => void result.current.openFailed('boom'));

      expect(result.current.registry).toEqual(stored);
    });
  });

  describe('removing the active Space', () => {
    const stored = { paths: ['/A', '/Gone', '/B'], activePath: '/A' };
    const statuses = (map: Record<string, SpaceFolderStatus>) => async (path: string) => map[path] ?? 'available';
    const closeApp = () => vi.fn(async () => {});

    it('switches to the next available Space first and forgets the old entry only once that Space has opened', async () => {
      const { result, storage } = await setup({ stored, probe: statuses({ '/Gone': 'missing' }) });
      act(() => result.current.confirmOpened());
      const close = closeApp();

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.removeActiveSpace(close);
      });

      expect(outcome).toBe('switching');
      expect(close).not.toHaveBeenCalled();
      // The normal switch happened; nothing is forgotten or persisted yet.
      expect(result.current.registry).toEqual({ paths: ['/A', '/Gone', '/B'], activePath: '/B' });
      expect(JSON.parse(storage.value!)).toEqual(stored);

      act(() => result.current.confirmOpened());

      expect(result.current.registry).toEqual({ paths: ['/Gone', '/B'], activePath: '/B' });
      expect(JSON.parse(storage.value!)).toEqual({ paths: ['/Gone', '/B'], activePath: '/B' });
    });

    it('a replacement that fails to open removes nothing: the old Space stays registered and active', async () => {
      const { result, storage } = await setup({ stored });
      act(() => result.current.confirmOpened());
      await act(async () => void (await result.current.removeActiveSpace(closeApp())));

      act(() => void result.current.openFailed('boom'));
      act(() => result.current.confirmOpened());

      expect(result.current.registry).toEqual(stored);
      expect(JSON.parse(storage.value!)).toEqual(stored);
    });

    it('cannot be left again while the replacement is opening: the guard refuses a switch, so the old Space is never both kept and removed', async () => {
      const { result } = await setup({ stored });
      act(() => result.current.confirmOpened());
      await act(async () => void (await result.current.removeActiveSpace(closeApp())));

      let switchedBack = true;
      await act(async () => {
        switchedBack = await result.current.switchSpace('/A');
      });
      act(() => result.current.confirmOpened());

      expect(switchedBack).toBe(false);
      expect(result.current.registry.activePath).not.toBe('/A');
      expect(result.current.registry.paths).not.toContain('/A');
    });

    it('tries the next candidate when a Space turns out not to be openable any more', async () => {
      let calls = 0;
      const { result } = await setup({
        stored,
        // Fine when `fallbackCandidates` looks, gone when the switch re-checks it.
        probe: async (path) => (path === '/Gone' ? 'missing' : path === '/B' && ++calls > 1 ? 'missing' : 'available'),
      });
      act(() => result.current.confirmOpened());

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.removeActiveSpace(closeApp());
      });

      // No other Space could open, so the last-Space path ran.
      expect(outcome).toBe('closed');
      expect(result.current.registry.activePath).toBeNull();
    });

    it('with no other Space available, closes the Application first, then forgets only the active entry and keeps the unavailable ones', async () => {
      const { result, storage } = await setup({
        stored,
        probe: statuses({ '/Gone': 'missing', '/B': 'missing' }),
      });
      act(() => result.current.confirmOpened());
      const order: string[] = [];
      const close = vi.fn(async () => {
        order.push(`close with ${result.current.registry.activePath}`);
      });

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.removeActiveSpace(close);
      });

      expect(outcome).toBe('closed');
      expect(order).toEqual(['close with /A']);
      expect(result.current.registry).toEqual({ paths: ['/Gone', '/B'], activePath: null });
      expect(JSON.parse(storage.value!)).toEqual({ paths: ['/Gone', '/B'], activePath: null });
    });

    it('removing the only Space leaves nothing configured', async () => {
      const { result } = await setup({ stored: { paths: ['/A'], activePath: '/A' } });
      act(() => result.current.confirmOpened());

      await act(async () => void (await result.current.removeActiveSpace(closeApp())));

      expect(result.current.registry).toEqual({ paths: [], activePath: null });
    });

    it('if closing the Application fails, nothing is removed and the user is told', async () => {
      const { result, storage } = await setup({ stored, probe: statuses({ '/Gone': 'missing', '/B': 'missing' }) });
      act(() => result.current.confirmOpened());
      vi.spyOn(console, 'error').mockImplementation(() => {});

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.removeActiveSpace(async () => {
          throw new Error('flush failed');
        });
      });

      expect(outcome).toBe('failed');
      expect(result.current.registry).toEqual(stored);
      expect(JSON.parse(storage.value!)).toEqual(stored);
      expect(result.current.notice?.text).toMatch(/was not removed/);
    });

    it('a repeated request while one is in progress does nothing', async () => {
      const { result } = await setup({ stored: { paths: ['/A'], activePath: '/A' } });
      act(() => result.current.confirmOpened());
      let release!: () => void;
      const slowClose = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));

      let first!: Promise<unknown>;
      let second: unknown;
      await act(async () => {
        first = result.current.removeActiveSpace(slowClose);
        second = await result.current.removeActiveSpace(slowClose);
        await waitFor(() => expect(slowClose).toHaveBeenCalled());
        release();
        await first;
      });

      expect(second).toBe('busy');
      expect(slowClose).toHaveBeenCalledOnce();
    });

    it('while a switch is waiting to finish, a second request is busy and removes nothing more', async () => {
      const { result } = await setup({ stored });
      act(() => result.current.confirmOpened());
      await act(async () => void (await result.current.removeActiveSpace(closeApp())));

      let second: unknown;
      await act(async () => {
        second = await result.current.removeActiveSpace(closeApp());
      });

      expect(second).toBe('busy');
    });

    it('tells the user when the removal could not be saved, and still removes it for this session', async () => {
      const failing: SpaceRegistryStorage = { getItem: () => JSON.stringify({ paths: ['/A'], activePath: '/A' }), setItem: () => { throw new Error('full'); } };
      const view = renderHook(() => useSpaceRegistry({ probe: async () => 'available', storage: failing }));
      await waitFor(() => expect(view.result.current.ready).toBe(true));

      await act(async () => void (await view.result.current.removeActiveSpace(async () => {})));

      expect(view.result.current.registry.activePath).toBeNull();
      expect(view.result.current.notice?.text).toMatch(/couldn’t save that/);
    });

    it('does nothing when no Space is active', async () => {
      const { result } = await setup({ stored: { paths: ['/A'], activePath: null } });

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.removeActiveSpace(closeApp());
      });

      expect(outcome).toBe('none');
    });

    it('never touches the folder: only the injected probe and close are involved', async () => {
      const probe = vi.fn(async (): Promise<SpaceFolderStatus> => 'available');
      const view = renderHook(() =>
        useSpaceRegistry({ probe, storage: memoryStorage({ paths: ['/A', '/B'], activePath: '/A' }) })
      );
      await waitFor(() => expect(view.result.current.ready).toBe(true));

      await act(async () => void (await view.result.current.removeActiveSpace(async () => {})));

      // The hook has no filesystem access beyond reading status through `probe`.
      expect(probe).toHaveBeenCalled();
    });
  });

  describe('renaming the active Space: the registry side', () => {
    const stored = { paths: ['/A', '/B'], activePath: '/A' };
    const pending = { from: '/A', to: '/A2', spaceId: 'id-1' };

    it('beginRename records the pending destination in storage synchronously, with the old path still active', async () => {
      const { result, storage } = await setup({ stored });
      act(() => result.current.confirmOpened());

      let started = false;
      act(() => {
        started = result.current.beginRename('/A2', 'id-1');
      });

      expect(started).toBe(true);
      expect(JSON.parse(storage.value!)).toEqual({ ...stored, pendingRename: pending });
      expect(result.current.registry.activePath).toBe('/A');
    });

    it('beginRename aborts, recording nothing, when the registry cannot be written', async () => {
      const failing: SpaceRegistryStorage = {
        getItem: () => JSON.stringify(stored),
        setItem: () => {
          throw new Error('full');
        },
      };
      const view = renderHook(() => useSpaceRegistry({ probe: async () => 'available', storage: failing }));
      await waitFor(() => expect(view.result.current.ready).toBe(true));

      let started = true;
      act(() => {
        started = view.result.current.beginRename('/A2', 'id-1');
      });

      expect(started).toBe(false);
      expect(view.result.current.registry.pendingRename).toBeUndefined();
    });

    it('beginRename refuses a second record', async () => {
      const { result } = await setup({ stored: { ...stored, pendingRename: pending } });
      let started = true;
      act(() => {
        started = result.current.beginRename('/A3', 'id-1');
      });
      expect(started).toBe(false);
    });

    it('completeRename moves the active path and clears the record in one write', async () => {
      const { result, storage } = await setup({ stored });
      act(() => result.current.confirmOpened());
      act(() => void result.current.beginRename('/A2', 'id-1'));
      const writes: string[] = [];
      const setItem = storage.setItem;
      storage.setItem = (key: string, value: string) => {
        writes.push(value);
        setItem(key, value);
      };

      let saved = false;
      act(() => {
        saved = result.current.completeRename('/A2');
      });

      expect(saved).toBe(true);
      expect(writes).toHaveLength(1);
      expect(JSON.parse(writes[0]!)).toEqual({ paths: ['/A2', '/B'], activePath: '/A2' });
      expect(result.current.registry).toEqual({ paths: ['/A2', '/B'], activePath: '/A2' });
    });

    it('a failed final write keeps the pending record in storage, follows the new path in memory, and never returns to the old one', async () => {
      const { result, storage } = await setup({ stored });
      act(() => result.current.confirmOpened());
      act(() => void result.current.beginRename('/A2', 'id-1'));
      const before = storage.value;
      storage.setItem = () => {
        throw new Error('full');
      };

      let saved = true;
      act(() => {
        saved = result.current.completeRename('/A2');
      });

      expect(saved).toBe(false);
      expect(storage.value).toBe(before); // still holds the record and the old path: next launch finishes it
      expect(JSON.parse(storage.value!).pendingRename).toEqual(pending);
      expect(result.current.registry.activePath).toBe('/A2');
      expect(result.current.notice?.text).toMatch(/finish the next time/);
      // A failed open of the new path cannot send the registry back to the old one.
      act(() => void result.current.openFailed('boom'));
      expect(result.current.registry.activePath).toBe('/A2');
    });

    it('abandonRename clears the record and keeps the old path', async () => {
      const { result, storage } = await setup({ stored });
      act(() => result.current.confirmOpened());
      act(() => void result.current.beginRename('/A2', 'id-1'));

      let saved = false;
      act(() => {
        saved = result.current.abandonRename();
      });

      expect(saved).toBe(true);
      expect(JSON.parse(storage.value!)).toEqual(stored);
    });
  });

  describe('startup: settling an unfinished rename before anything opens', () => {
    const pending = { from: '/A', to: '/A2', spaceId: 'id-1' };
    const stored = { paths: ['/A', '/B'], activePath: '/A', pendingRename: pending };

    it('re-points the registry to the verified destination and has PERSISTED that by the time it is ready', async () => {
      const seen: unknown[] = [];
      const { result, storage } = await setup({
        stored,
        probe: async (path) => (path === '/A' ? 'missing' : 'available'),
        readSpaceId: async (path) => (path === '/A2' ? 'id-1' : null),
      });

      seen.push(JSON.parse(storage.value!));

      expect(seen[0]).toEqual({ paths: ['/A2', '/B'], activePath: '/A2' });
      expect(result.current.registry.activePath).toBe('/A2');
      expect(result.current.activeSpaceMissing).toBe(false);
    });

    it('keeps the original and clears the record when the rename never happened', async () => {
      const { result, storage } = await setup({
        stored,
        probe: async (path) => (path === '/A2' ? 'missing' : 'available'),
        readSpaceId: async () => 'id-1',
      });

      expect(result.current.registry).toEqual({ paths: ['/A', '/B'], activePath: '/A' });
      expect(JSON.parse(storage.value!)).toEqual({ paths: ['/A', '/B'], activePath: '/A' });
    });

    it('does not open an old path that is not the recorded Space, keeps the record and reports the active Space lost', async () => {
      const { result, storage } = await setup({
        stored,
        probe: async (path) => (path === '/A2' ? 'missing' : 'available'),
        readSpaceId: async () => 'a-different-space',
      });

      expect(result.current.activeSpaceMissing).toBe(true);
      expect(result.current.registry.pendingRename).toEqual(pending);
      expect(JSON.parse(storage.value!)).toEqual(stored);
    });

    it('with an unavailable path decides nothing and keeps the record', async () => {
      const { result } = await setup({
        stored,
        probe: async (path) => (path === '/A' ? 'unavailable' : 'available'),
        readSpaceId: async () => 'id-1',
      });

      expect(result.current.registry.pendingRename).toEqual(pending);
      expect(result.current.activeSpaceMissing).toBe(false); // unavailable is not missing
    });

    it('with both folders missing keeps the registration and the record and uses the missing-Space flow', async () => {
      const { result } = await setup({ stored, probe: async () => 'missing' });

      expect(result.current.registry.paths).toEqual(['/A', '/B']);
      expect(result.current.registry.pendingRename).toEqual(pending);
      expect(result.current.activeSpaceMissing).toBe(true);
    });

    it('a re-point that cannot be saved opens nothing from an unconfirmed registry', async () => {
      const failing: SpaceRegistryStorage = {
        getItem: () => JSON.stringify(stored),
        setItem: () => {
          throw new Error('full');
        },
      };
      const view = renderHook(() =>
        useSpaceRegistry({
          probe: async (path) => (path === '/A' ? 'missing' : 'available'),
          storage: failing,
          readSpaceId: async () => 'id-1',
        })
      );
      await waitFor(() => expect(view.result.current.ready).toBe(true));

      expect(view.result.current.registry).toEqual(stored);
      expect(view.result.current.activeSpaceMissing).toBe(true);
    });

    it('with no way to read identities, nothing is verified and the record stays', async () => {
      const { result } = await setup({ stored, probe: async () => 'available' });

      expect(result.current.registry.pendingRename).toEqual(pending);
      // Undecided is not "lost": nothing is declared missing, and the record waits for a retry.
      expect(result.current.activeSpaceMissing).toBe(false);
    });
  });

  describe('the shared lifecycle guard', () => {
    const stored = { paths: ['/A', '/B'], activePath: '/A' };

    it('refuses a switch, a select and a removal while a rename holds it, and allows them after', async () => {
      const { result } = await setup({ stored });
      act(() => result.current.confirmOpened());
      const release = result.current.lifecycle.begin('renaming')!;

      let switched = true;
      let selected = true;
      await act(async () => {
        switched = await result.current.switchSpace('/B');
        selected = await result.current.selectSpace('/B');
        result.current.removeSpace('/B');
      });

      expect(switched).toBe(false);
      expect(selected).toBe(false);
      expect(result.current.registry).toEqual(stored);
      expect(result.current.notice?.text).toMatch(/being renamed/);

      release();
      await act(async () => void (await result.current.switchSpace('/B')));
      expect(result.current.registry.activePath).toBe('/B');
    });

    it('refuses to remove the active Space while a rename holds it', async () => {
      const { result } = await setup({ stored });
      result.current.lifecycle.begin('renaming');

      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.removeActiveSpace(async () => {});
      });

      expect(outcome).toBe('busy');
    });

    it('a removal that switches away holds the guard until the replacement opens, then releases it', async () => {
      const { result } = await setup({ stored });
      act(() => result.current.confirmOpened());
      await act(async () => void (await result.current.removeActiveSpace(async () => {})));
      expect(result.current.lifecycle.active).toBe('removing');
      expect(result.current.lifecycle.begin('renaming')).toBeNull();

      act(() => result.current.confirmOpened());

      expect(result.current.lifecycle.active).toBeNull();
    });

    it('a removal whose replacement fails to open releases the guard too', async () => {
      const { result } = await setup({ stored });
      act(() => result.current.confirmOpened());
      await act(async () => void (await result.current.removeActiveSpace(async () => {})));

      act(() => void result.current.openFailed('boom'));

      expect(result.current.lifecycle.active).toBeNull();
    });
  });

  describe('startup: the unfinished rename, with its saved-state migration', () => {
    const pending = { from: '/A', to: '/A2', spaceId: 'id-1' };
    const stored = { paths: ['/A', '/B'], activePath: '/A', pendingRename: pending };
    const renamedOnDisk = {
      probe: async (path: string): Promise<SpaceFolderStatus> => (path === '/A' ? 'missing' : 'available'),
      readSpaceId: async (path: string): Promise<SpaceIdReading> => (path === '/A2' ? 'id-1' : null),
    };

    it('both folders carrying the recorded id: neither is opened, the record and both folders are left, and recovery takes over', async () => {
      const migrateState = vi.fn(async () => true);
      const { result, storage } = await setup({
        stored,
        probe: async () => 'available',
        readSpaceId: async () => 'id-1',
        migrateState,
      });

      expect(result.current.activeSpaceMissing).toBe(true); // held back like a lost Space: the existing recovery runs
      expect(result.current.registry).toEqual(stored);
      expect(JSON.parse(storage.value!)).toEqual(stored);
      expect(migrateState).not.toHaveBeenCalled();
      expect(result.current.notice?.text).toMatch(/Neither was opened or changed/);
    });

    it('retries the migration, then persists the new path and clears the record together, before it is ready', async () => {
      const order: string[] = [];
      const storage = memoryStorage(stored);
      const setItem = storage.setItem;
      storage.setItem = (key: string, value: string) => {
        order.push('persist');
        setItem(key, value);
      };
      const view = renderHook(() =>
        useSpaceRegistry({
          defaultPath: '/Default',
          ...renamedOnDisk,
          storage,
          migrateState: async () => {
            order.push('migrate');
            return true;
          },
        })
      );
      await waitFor(() => expect(view.result.current.ready).toBe(true));

      expect(order).toEqual(['migrate', 'persist']);
      expect(JSON.parse(storage.value!)).toEqual({ paths: ['/A2', '/B'], activePath: '/A2' });
    });

    it('a migration that fails keeps the record, does not move the registry, and does not open the Space', async () => {
      const { result, storage } = await setup({ stored, ...renamedOnDisk, migrateState: async () => false });

      expect(result.current.activeSpaceMissing).toBe(true);
      expect(result.current.registry).toEqual(stored);
      expect(JSON.parse(storage.value!)).toEqual(stored);
      expect(result.current.notice?.text).toMatch(/try again next time/);
    });

    it('a failed migration is retried on the next launch and then completes', async () => {
      const storage = memoryStorage(stored);
      let attempts = 0;
      const launch = () =>
        renderHook(() =>
          useSpaceRegistry({
            defaultPath: '/Default',
            ...renamedOnDisk,
            storage,
            migrateState: async () => ++attempts > 1,
          })
        );

      const first = launch();
      await waitFor(() => expect(first.result.current.ready).toBe(true));
      expect(JSON.parse(storage.value!)).toEqual(stored);
      first.unmount();

      const second = launch();
      await waitFor(() => expect(second.result.current.ready).toBe(true));

      expect(attempts).toBe(2);
      expect(second.result.current.activeSpaceMissing).toBe(false);
      expect(JSON.parse(storage.value!)).toEqual({ paths: ['/A2', '/B'], activePath: '/A2' });
    });

    it('migration succeeds but the registry write fails: nothing opens, the record stays, and the next launch repeats it harmlessly', async () => {
      let writable = false;
      const backing = JSON.stringify(stored);
      let current = backing;
      const storage: SpaceRegistryStorage = {
        getItem: () => current,
        setItem: (_key, value) => {
          if (!writable) throw new Error('full');
          current = value;
        },
      };
      const migrateState = vi.fn(async () => true);
      const launch = () =>
        renderHook(() => useSpaceRegistry({ defaultPath: '/Default', ...renamedOnDisk, storage, migrateState }));

      const first = launch();
      await waitFor(() => expect(first.result.current.ready).toBe(true));
      expect(first.result.current.activeSpaceMissing).toBe(true);
      expect(JSON.parse(current)).toEqual(stored);
      first.unmount();

      writable = true;
      const second = launch();
      await waitFor(() => expect(second.result.current.ready).toBe(true));

      expect(migrateState).toHaveBeenCalledTimes(2); // retried, and it is idempotent
      expect(second.result.current.activeSpaceMissing).toBe(false);
      expect(JSON.parse(current)).toEqual({ paths: ['/A2', '/B'], activePath: '/A2' });
    });
  });

  describe('the lifecycle guard is released on every path', () => {
    const stored = { paths: ['/A', '/B'], activePath: '/A' };
    const close = async () => {};

    it('when the replacement fails to open, switching and removal work again afterwards', async () => {
      const { result } = await setup({ stored });
      act(() => result.current.confirmOpened());
      await act(async () => void (await result.current.removeActiveSpace(close)));

      act(() => void result.current.openFailed('boom'));

      expect(result.current.lifecycle.active).toBeNull();
      expect(result.current.registry.paths).toContain('/A'); // nothing was forgotten
      let switched = false;
      await act(async () => {
        switched = await result.current.switchSpace('/B');
      });
      expect(switched).toBe(true);
    });

    it('when the replacement fails without anyone reporting it, abortPendingRemoval releases the guard and keeps the entry', async () => {
      const { result } = await setup({ stored });
      act(() => result.current.confirmOpened());
      await act(async () => void (await result.current.removeActiveSpace(close)));
      expect(result.current.lifecycle.active).toBe('removing');

      act(() => result.current.abortPendingRemoval());
      act(() => result.current.confirmOpened()); // a later, unrelated open does not forget the old entry

      expect(result.current.lifecycle.active).toBeNull();
      expect(result.current.registry.paths).toContain('/A');
    });

    it('a recovery that selects a Space while a removal waits for an open that went wrong is not held up, and drops the removal', async () => {
      const { result } = await setup({ stored: { paths: ['/A', '/B', '/C'], activePath: '/A' } });
      act(() => result.current.confirmOpened());
      await act(async () => void (await result.current.removeActiveSpace(close)));

      let accepted = false;
      await act(async () => {
        accepted = await result.current.selectSpace('/C');
      });

      expect(accepted).toBe(true);
      expect(result.current.registry.activePath).toBe('/C');
      expect(result.current.lifecycle.active).toBeNull();
      act(() => result.current.confirmOpened());
      expect(result.current.registry.paths).toContain('/A'); // the dropped removal forgets nothing
    });

    it('a rename still holds selection back: only a removal yields to recovery', async () => {
      const { result } = await setup({ stored });
      const release = result.current.lifecycle.begin('renaming')!;

      let accepted = true;
      await act(async () => {
        accepted = await result.current.selectSpace('/B');
      });

      expect(accepted).toBe(false);
      release();
    });

    it('a removal that closes the last Space, or whose close fails, releases the guard', async () => {
      const { result } = await setup({ stored: { paths: ['/A'], activePath: '/A' } });
      act(() => result.current.confirmOpened());
      await act(async () => void (await result.current.removeActiveSpace(close)));
      expect(result.current.lifecycle.active).toBeNull();

      const failing = await setup({ stored: { paths: ['/A'], activePath: '/A' } });
      act(() => failing.result.current.confirmOpened());
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await act(async () => {
        await failing.result.current.removeActiveSpace(async () => {
          throw new Error('flush failed');
        });
      });
      expect(failing.result.current.lifecycle.active).toBeNull();
    });

    it('removal safety is intact: the old entry is forgotten only after the replacement opens, and never touched on disk by the registry', async () => {
      const { result, storage } = await setup({ stored });
      act(() => result.current.confirmOpened());
      await act(async () => void (await result.current.removeActiveSpace(close)));
      expect(JSON.parse(storage.value!)).toEqual(stored); // not yet

      act(() => result.current.confirmOpened());

      expect(JSON.parse(storage.value!)).toEqual({ paths: ['/B'], activePath: '/B' });
      expect(result.current.lifecycle.active).toBeNull();
    });
  });

  describe('renaming an inactive Space: the registry side', () => {
    const stored = { paths: ['/A', '/B', '/C'], activePath: '/A' };

    it('moves only that entry, keeps the active Space, and persists it onto the last opened registry', async () => {
      const { result, storage } = await setup({ stored });
      act(() => result.current.confirmOpened());

      let moved = false;
      act(() => {
        moved = result.current.renameInactiveSpace('/B', '/Bee');
      });

      expect(moved).toBe(true);
      expect(result.current.registry).toEqual({ paths: ['/A', '/Bee', '/C'], activePath: '/A' });
      expect(JSON.parse(storage.value!)).toEqual({ paths: ['/A', '/Bee', '/C'], activePath: '/A' });
    });

    it('never persists a Space whose switch is still in flight', async () => {
      const { result, storage } = await setup({ stored });
      act(() => result.current.confirmOpened());
      await act(async () => void (await result.current.switchSpace('/C')));

      act(() => void result.current.renameInactiveSpace('/B', '/Bee'));

      expect(JSON.parse(storage.value!)).toEqual({ paths: ['/A', '/Bee', '/C'], activePath: '/A' });
      expect(result.current.registry.activePath).toBe('/C');
    });

    it('refuses the open Space and an unregistered path, changing nothing', async () => {
      const { result } = await setup({ stored });
      const before = result.current.registry;

      let activeMoved = true;
      let unknownMoved = true;
      act(() => {
        activeMoved = result.current.renameInactiveSpace('/A', '/A2');
        unknownMoved = result.current.renameInactiveSpace('/Nope', '/X');
      });

      expect(activeMoved).toBe(false);
      expect(unknownMoved).toBe(false);
      expect(result.current.registry).toBe(before);
    });

    it('a failed write still follows the new path in memory, reports false, and tells the user', async () => {
      const failing: SpaceRegistryStorage = {
        getItem: () => JSON.stringify(stored),
        setItem: () => {
          throw new Error('full');
        },
      };
      const view = renderHook(() => useSpaceRegistry({ probe: async () => 'available', storage: failing }));
      await waitFor(() => expect(view.result.current.ready).toBe(true));
      act(() => view.result.current.confirmOpened());

      let moved = true;
      act(() => {
        moved = view.result.current.renameInactiveSpace('/B', '/Bee');
      });

      expect(moved).toBe(false);
      expect(view.result.current.registry.paths).toContain('/Bee');
      expect(view.result.current.notice?.text).toMatch(/couldn’t save/);
    });
  });
});
