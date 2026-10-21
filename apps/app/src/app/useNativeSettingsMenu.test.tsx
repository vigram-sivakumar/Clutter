// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
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

import { OPEN_SETTINGS_MENU_EVENT, useNativeSettingsMenu } from './useNativeSettingsMenu';

describe('useNativeSettingsMenu', () => {
  beforeEach(() => {
    listeners.clear();
    unlisten.mockClear();
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
