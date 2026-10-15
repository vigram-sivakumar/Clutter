// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
  probe?: (path: string) => Promise<boolean>;
  pick?: () => Promise<string | null>;
}) {
  const storage = memoryStorage(options.stored);
  const probe = options.probe ?? (async () => true);
  const view = renderHook(() =>
    useSpaceRegistry({ defaultPath: '/Default', probe, pick: options.pick, storage })
  );
  await waitFor(() => expect(view.result.current.ready).toBe(true));
  return { ...view, storage };
}

describe('useSpaceRegistry', () => {
  it('registers and activates the picked folder, persisting only once it has opened', async () => {
    const { result, storage } = await setup({ pick: async () => '/Picked/Notes' });

    await act(() => result.current.addSpace!());

    expect(result.current.registry).toEqual({
      paths: ['/Default', '/Picked/Notes'],
      activePath: '/Picked/Notes',
    });
    expect(storage.value).toBeNull();

    act(() => result.current.confirmOpened());
    expect(JSON.parse(storage.value!)).toEqual(result.current.registry);
  });

  it('leaves everything unchanged when the picker is cancelled', async () => {
    const { result } = await setup({ pick: async () => null });
    const before = result.current.registry;

    await act(() => result.current.addSpace!());

    expect(result.current.registry).toBe(before);
    expect(result.current.notice).toBeNull();
  });

  it('activates an already registered Space instead of registering it twice', async () => {
    const { result } = await setup({
      stored: { paths: ['/Default', '/Other'], activePath: '/Default' },
      pick: async () => '/Other/',
    });

    await act(() => result.current.addSpace!());

    expect(result.current.registry).toEqual({ paths: ['/Default', '/Other'], activePath: '/Other' });
  });

  it('refuses an unavailable folder with a message and keeps the active Space', async () => {
    const probe = vi.fn(async (path: string) => path === '/Default');
    const { result } = await setup({ probe, pick: async () => '/Gone' });

    await act(() => result.current.addSpace!());

    expect(result.current.registry).toEqual({ paths: ['/Default'], activePath: '/Default' });
    expect(result.current.notice?.text).toContain('/Gone');
  });

  it('returns to the previous Space when the new one fails to open', async () => {
    const { result } = await setup({ pick: async () => '/Bad' });
    act(() => result.current.confirmOpened());

    await act(() => result.current.addSpace!());
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

  it('starts in another registered Space when the stored active one is gone', async () => {
    const { result } = await setup({
      stored: { paths: ['/Default', '/Missing'], activePath: '/Missing' },
      probe: async (path) => path !== '/Missing',
    });

    expect(result.current.registry.activePath).toBe('/Default');
    expect(result.current.registry.paths).toContain('/Missing');
    expect(result.current.notice?.text).toContain('/Missing');
  });

  it('has no addSpace without a folder picker', async () => {
    const { result } = await setup({});
    expect(result.current.addSpace).toBeUndefined();
  });
});
