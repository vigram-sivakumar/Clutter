// @vitest-environment jsdom

import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listeners = new Map<string, (event: { payload: unknown }) => void>();
let tauri = true;

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => tauri }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, handler: (event: { payload: unknown }) => void) => {
    listeners.set(name, handler);
    return () => {};
  }),
}));

import { ZOOM_CHANGED_EVENT, installNativeZoom } from './nativeZoom';

const zoomVar = () => document.documentElement.style.getPropertyValue('--app-zoom');

describe('installNativeZoom', () => {
  beforeEach(() => {
    listeners.clear();
    tauri = true;
    document.documentElement.style.removeProperty('--app-zoom');
  });

  it('listens for the event name the Rust side emits', async () => {
    installNativeZoom();
    await waitFor(() => expect(listeners.has('zoom:changed')).toBe(true));
    expect(ZOOM_CHANGED_EVENT).toBe('zoom:changed');
  });

  it('publishes the factor as --app-zoom', async () => {
    installNativeZoom();
    await waitFor(() => expect(listeners.size).toBe(1));
    listeners.get(ZOOM_CHANGED_EVENT)!({ payload: 1.3 });
    expect(zoomVar()).toBe('1.3');
  });

  it('ignores a payload that is not a positive number', async () => {
    installNativeZoom();
    await waitFor(() => expect(listeners.size).toBe(1));
    for (const payload of ['1.2', 0, -1, NaN, null]) listeners.get(ZOOM_CHANGED_EVENT)!({ payload });
    expect(zoomVar()).toBe('');
  });

  it('does nothing outside the desktop app', () => {
    tauri = false;
    installNativeZoom();
    expect(listeners.size).toBe(0);
  });
});
