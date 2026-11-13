// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocalDay } from './useLocalDay';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 13, 23, 59, 59, 900));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('useLocalDay', () => {
  it('changes at the next local midnight without user interaction', async () => {
    const { result } = renderHook(() => useLocalDay());
    expect(result.current).toBe('2026-11-13');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(102);
    });
    expect(result.current).toBe('2026-11-14');
  });
  it.each(['focus', 'visibilitychange'])(
    'catches up after sleep on %s',
    (event) => {
      const { result } = renderHook(() => useLocalDay());
      vi.setSystemTime(new Date(2026, 10, 15, 10));
      act(() => {
        (event === 'focus' ? window : document).dispatchEvent(new Event(event));
      });
      expect(result.current).toBe('2026-11-15');
    }
  );
  it('cancels the timer when unmounted', () => {
    const { unmount } = renderHook(() => useLocalDay());
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
