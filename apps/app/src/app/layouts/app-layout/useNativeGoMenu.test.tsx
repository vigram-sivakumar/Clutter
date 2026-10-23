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

import { GO_MENU_EVENTS, useNativeGoMenu } from './useNativeGoMenu';

describe('useNativeGoMenu', () => {
  beforeEach(() => {
    listeners.clear();
    unlisten.mockClear();
    tauri = true;
  });

  it('listens for the event names the Rust side emits', async () => {
    renderHook(() => useNativeGoMenu({ onBack: vi.fn(), onForward: vi.fn() }));
    await waitFor(() => expect(listeners.size).toBe(2));
    expect([...listeners.keys()].sort()).toEqual(['menu:go-back', 'menu:go-forward']);
  });

  it('runs back and forward from the menu items', async () => {
    const onBack = vi.fn();
    const onForward = vi.fn();
    renderHook(() => useNativeGoMenu({ onBack, onForward }));
    await waitFor(() => expect(listeners.size).toBe(2));
    listeners.get(GO_MENU_EVENTS.back)!();
    listeners.get(GO_MENU_EVENTS.forward)!();
    expect(onBack).toHaveBeenCalledOnce();
    expect(onForward).toHaveBeenCalledOnce();
  });

  it('uses the newest handlers without subscribing again, and unsubscribes on unmount', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(({ onBack }) => useNativeGoMenu({ onBack, onForward: vi.fn() }), {
      initialProps: { onBack: first },
    });
    await waitFor(() => expect(listeners.size).toBe(2));
    rerender({ onBack: second });
    listeners.get(GO_MENU_EVENTS.back)!();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    unmount();
    expect(unlisten).toHaveBeenCalledTimes(2);
  });

  it('does nothing outside the desktop app', () => {
    tauri = false;
    renderHook(() => useNativeGoMenu({ onBack: vi.fn(), onForward: vi.fn() }));
    expect(listeners.size).toBe(0);
  });
});
