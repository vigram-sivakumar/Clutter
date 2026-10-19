// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SpaceFolderStatus } from '../../core/vault/providers/probeSpaceFolder';
import type { SpaceRegistryStorage } from './spaceRegistry';
import { useSpaceRegistry } from './useSpaceRegistry';

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
}) {
  const storage = memoryStorage(options.stored);
  const probe = options.probe ?? (async (): Promise<SpaceFolderStatus> => 'available');
  const view = renderHook(() =>
    useSpaceRegistry({ defaultPath: '/Default', probe, pick: options.pick, storage })
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
});

