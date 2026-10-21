// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listeners = new Map<string, () => void>();
const unlisten = vi.fn();
const invoke = vi.fn(async () => undefined);
let tauri = true;

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => tauri, invoke: (...args: unknown[]) => invoke(...(args as [])) }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, handler: () => void) => {
    listeners.set(name, handler);
    return unlisten;
  }),
}));

import { COPY_PAGE_LINK_MENU_EVENT, useNativeEditMenu } from './useNativeEditMenu';

describe('useNativeEditMenu', () => {
  beforeEach(() => {
    listeners.clear();
    unlisten.mockClear();
    invoke.mockClear();
    tauri = true;
  });

  it('uses the event name the Rust side emits', () => {
    expect(COPY_PAGE_LINK_MENU_EVENT).toBe('menu:copy-page-link');
  });

  it('runs the copy action when the menu item is chosen', async () => {
    const copy = vi.fn();
    renderHook(() => useNativeEditMenu(true, copy));
    await waitFor(() => expect(listeners.has(COPY_PAGE_LINK_MENU_EVENT)).toBe(true));
    listeners.get(COPY_PAGE_LINK_MENU_EVENT)!();
    expect(copy).toHaveBeenCalledOnce();
  });

  it('calls the latest action without resubscribing', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => useNativeEditMenu(true, fn), { initialProps: { fn: first } });
    await waitFor(() => expect(listeners.size).toBe(1));
    rerender({ fn: second });
    listeners.get(COPY_PAGE_LINK_MENU_EVENT)!();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('enables the item only while a page is open', async () => {
    const { rerender } = renderHook(({ open }) => useNativeEditMenu(open, vi.fn()), { initialProps: { open: false } });
    expect(invoke).toHaveBeenLastCalledWith('set_copy_page_link_enabled', { enabled: false });
    rerender({ open: true });
    expect(invoke).toHaveBeenLastCalledWith('set_copy_page_link_enabled', { enabled: true });
    rerender({ open: false });
    expect(invoke).toHaveBeenLastCalledWith('set_copy_page_link_enabled', { enabled: false });
  });

  it('disables the item and stops listening on unmount', async () => {
    const { unmount } = renderHook(() => useNativeEditMenu(true, vi.fn()));
    await waitFor(() => expect(listeners.size).toBe(1));
    unmount();
    expect(unlisten).toHaveBeenCalled();
    expect(invoke).toHaveBeenLastCalledWith('set_copy_page_link_enabled', { enabled: false });
  });

  it('does nothing outside Tauri', () => {
    tauri = false;
    renderHook(() => useNativeEditMenu(true, vi.fn()));
    expect(listeners.size).toBe(0);
    expect(invoke).not.toHaveBeenCalled();
  });
});
