// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Application } from '@core/application/Application';
import { useArchiveCleanup } from './useArchiveCleanup';

const HOUR = 60 * 60 * 1000;

/** The part of an Application the hook uses: a cleanup entry point, and the Space's profile changes. */
function fakeApplication() {
  const listeners = new Set<() => void>();

  return {
    runArchiveCleanupIfEnabled: vi.fn().mockResolvedValue(0),
    spaceProfileStore: {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    /** The Space's setting changed (the hook asks the Application whether it is on). */
    settingChanged: () => listeners.forEach((listener) => listener()),
    listenerCount: () => listeners.size,
  };
}
const asApplication = (fake: ReturnType<typeof fakeApplication>) => fake as unknown as Application;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useArchiveCleanup', () => {
  it('asks the Application to run at startup, on every hourly tick, and when the Space setting changes', () => {
    const application = fakeApplication();
    renderHook(() => useArchiveCleanup(asApplication(application)));

    expect(application.runArchiveCleanupIfEnabled).toHaveBeenCalledTimes(1);
    expect(application.runArchiveCleanupIfEnabled.mock.calls[0]?.[0]).toBeInstanceOf(Date);

    act(() => vi.advanceTimersByTime(HOUR));
    expect(application.runArchiveCleanupIfEnabled).toHaveBeenCalledTimes(2);

    act(() => application.settingChanged());
    expect(application.runArchiveCleanupIfEnabled).toHaveBeenCalledTimes(3);
  });

  it('leaves the "is it on for this Space" decision to the Application: it never reads a setting itself', () => {
    const application = fakeApplication();
    localStorage.setItem('clutter-auto-delete-archived', 'true'); // the old app-wide key must mean nothing here
    renderHook(() => useArchiveCleanup(asApplication(application)));

    // It still only asks; the Application (which knows this Space's setting) decides whether anything runs.
    expect(application.runArchiveCleanupIfEnabled).toHaveBeenCalledTimes(1);
    localStorage.clear();
  });

  it('stops for good when the layout unmounts, e.g. on switching Space, and never reaches the old vault', () => {
    const first = fakeApplication();
    const { unmount } = renderHook(() => useArchiveCleanup(asApplication(first)));
    unmount();

    act(() => vi.advanceTimersByTime(3 * HOUR));
    act(() => first.settingChanged());

    expect(first.runArchiveCleanupIfEnabled).toHaveBeenCalledTimes(1);
    expect(first.listenerCount()).toBe(0);
  });

  it('is scoped to the application it was given: a new Space gets its own run', () => {
    const first = fakeApplication();
    const second = fakeApplication();
    const { rerender } = renderHook(({ application }) => useArchiveCleanup(asApplication(application)), {
      initialProps: { application: first },
    });

    rerender({ application: second });
    act(() => vi.advanceTimersByTime(HOUR));

    expect(first.runArchiveCleanupIfEnabled).toHaveBeenCalledTimes(1);
    expect(second.runArchiveCleanupIfEnabled).toHaveBeenCalledTimes(2);
    expect(first.listenerCount()).toBe(0);
  });
});
