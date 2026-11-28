// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listeners = new Map<string, () => void>();
const unlisten = vi.fn();
let tauri = true;

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => tauri }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, handler: () => void) => {
    listeners.set(name, handler);
    return unlisten;
  }),
}));

import { listen } from '@tauri-apps/api/event';
import { OPEN_SETTINGS_MENU_EVENT, useNativeSettingsMenu } from './useNativeSettingsMenu';

describe('useNativeSettingsMenu', () => {
  beforeEach(() => {
    listeners.clear();
    unlisten.mockClear();
    vi.mocked(listen).mockClear();
    tauri = true;
  });

  it('listens for the native menu event with the name the Rust side emits', async () => {
    renderHook(() => useNativeSettingsMenu(true, vi.fn()));
    await waitFor(() => expect(listeners.has('menu:open-settings')).toBe(true));
    expect(OPEN_SETTINGS_MENU_EVENT).toBe('menu:open-settings');
  });

  it('opens Settings when the item is chosen and Settings is available', async () => {
    const open = vi.fn();
    renderHook(() => useNativeSettingsMenu(true, open));
    await waitFor(() => expect(listeners.size).toBe(1));
    listeners.get(OPEN_SETTINGS_MENU_EVENT)!();
    expect(open).toHaveBeenCalledOnce();
  });

  it('does nothing when Settings is unavailable (Welcome, full-screen error)', async () => {
    const open = vi.fn();
    renderHook(() => useNativeSettingsMenu(false, open));
    await waitFor(() => expect(listeners.size).toBe(1));
    listeners.get(OPEN_SETTINGS_MENU_EVENT)!();
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps one subscription and uses current availability and handler through rerenders', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ available, open }) => useNativeSettingsMenu(available, open),
      { initialProps: { available: true, open: first } }
    );
    await waitFor(() => expect(listeners.size).toBe(1));
    const handler = listeners.get(OPEN_SETTINGS_MENU_EVENT)!;
    handler();
    expect(first).toHaveBeenCalledOnce();

    rerender({ available: false, open: second });
    handler();
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();

    rerender({ available: true, open: second });
    handler();
    expect(second).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledOnce();
    expect(listen).toHaveBeenCalledTimes(1);
    expect(unlisten).not.toHaveBeenCalled();
  });

  it('cleans up a subscription that resolves after unmount and ignores stale delivery', async () => {
    let finish!: (fn: () => void) => void;
    let deliver!: () => void;
    vi.mocked(listen).mockImplementationOnce((_name, handler) => {
      deliver = () => handler({ event: OPEN_SETTINGS_MENU_EVENT, id: 1, payload: undefined });
      return new Promise<() => void>((resolve) => { finish = resolve; });
    });
    const open = vi.fn();
    const { unmount } = renderHook(() => useNativeSettingsMenu(true, open));
    expect(listen).toHaveBeenCalledTimes(1);
    unmount();
    deliver();
    expect(open).not.toHaveBeenCalled();
    await act(async () => { finish(unlisten); });
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('reports a failed subscription without opening Settings', async () => {
    const error = new Error('listen failed');
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(listen).mockRejectedValueOnce(error);
    const open = vi.fn();
    try {
      renderHook(() => useNativeSettingsMenu(true, open));
      await waitFor(() => expect(report).toHaveBeenCalledWith('Could not listen for the Settings menu item', error));
      expect(open).not.toHaveBeenCalled();
      expect(unlisten).not.toHaveBeenCalled();
    } finally {
      report.mockRestore();
    }
  });

  it('stops listening on unmount', async () => {
    const { unmount } = renderHook(() => useNativeSettingsMenu(true, vi.fn()));
    await waitFor(() => expect(listeners.size).toBe(1));
    unmount();
    expect(unlisten).toHaveBeenCalled();
  });

  it('does not subscribe outside Tauri', () => {
    tauri = false;
    renderHook(() => useNativeSettingsMenu(true, vi.fn()));
    expect(listeners.size).toBe(0);
  });
});
