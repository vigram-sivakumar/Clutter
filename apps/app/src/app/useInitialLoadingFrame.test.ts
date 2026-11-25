// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInitialLoadingFrame } from './useInitialLoadingFrame';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('initial loading presentation', () => {
  it('holds a fast startup, fades, and does not delay subsequent switches', () => {
    const { result, rerender } = renderHook(({ opening, ready, interrupted }) =>
      useInitialLoadingFrame(opening, ready, interrupted),
      { initialProps: { opening: true, ready: false, interrupted: false } });
    tick(100);
    rerender({ opening: false, ready: true, interrupted: false });
    tick(699);
    expect(result.current).toBe('holding');
    tick(1);
    expect(result.current).toBe('fading');
    tick(150);
    expect(result.current).toBe('done');
    rerender({ opening: true, ready: false, interrupted: false });
    expect(result.current).toBe('done');
  });

  it('does not finish while loading and exits immediately on interruption', () => {
    const { result, rerender } = renderHook(({ interrupted }) =>
      useInitialLoadingFrame(true, false, interrupted),
      { initialProps: { interrupted: false } });
    tick(2000);
    expect(result.current).toBe('holding');
    rerender({ interrupted: true });
    expect(result.current).toBe('done');
  });
});
