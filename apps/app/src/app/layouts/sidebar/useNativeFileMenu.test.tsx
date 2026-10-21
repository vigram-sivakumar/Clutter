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

import { FILE_MENU_EVENTS, useNativeFileMenu } from './useNativeFileMenu';

function actions() {
  return { onNewNote: vi.fn(), onNewDailyNote: vi.fn(), onNewFolder: vi.fn() };
}

describe('useNativeFileMenu', () => {
  beforeEach(() => {
    listeners.clear();
    unlisten.mockClear();
    tauri = true;
  });

  it('uses the event names the Rust side emits', () => {
    expect(FILE_MENU_EVENTS).toEqual({
      newNote: 'menu:new-note',
      newDailyNote: 'menu:new-daily-note',
      newFolder: 'menu:new-folder',
    });
  });

  it('routes each menu event to its own handler', async () => {
    const a = actions();
    renderHook(() => useNativeFileMenu(a));
    await waitFor(() => expect(listeners.size).toBe(3));

    listeners.get(FILE_MENU_EVENTS.newNote)!();
    expect(a.onNewNote).toHaveBeenCalledOnce();
    listeners.get(FILE_MENU_EVENTS.newDailyNote)!();
    expect(a.onNewDailyNote).toHaveBeenCalledOnce();
    listeners.get(FILE_MENU_EVENTS.newFolder)!();
    expect(a.onNewFolder).toHaveBeenCalledOnce();
    expect(a.onNewNote).toHaveBeenCalledOnce();
  });

  it('calls the latest handlers without resubscribing', async () => {
    const first = actions();
    const second = actions();
    const { rerender } = renderHook(({ a }) => useNativeFileMenu(a), { initialProps: { a: first } });
    await waitFor(() => expect(listeners.size).toBe(3));
    rerender({ a: second });
    listeners.get(FILE_MENU_EVENTS.newNote)!();
    expect(first.onNewNote).not.toHaveBeenCalled();
    expect(second.onNewNote).toHaveBeenCalledOnce();
  });

  it('stops listening on unmount', async () => {
    const { unmount } = renderHook(() => useNativeFileMenu(actions()));
    await waitFor(() => expect(listeners.size).toBe(3));
    unmount();
    expect(unlisten).toHaveBeenCalledTimes(3);
  });

  it('does not subscribe outside Tauri', () => {
    tauri = false;
    renderHook(() => useNativeFileMenu(actions()));
    expect(listeners.size).toBe(0);
  });
});
