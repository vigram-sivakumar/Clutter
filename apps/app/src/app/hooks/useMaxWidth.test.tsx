// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMaxWidth } from './useMaxWidth';

type Listener = () => void;

function installMatchMedia(initialWidth: number) {
  let width = initialWidth;
  const lists: Array<{ max: number; listeners: Set<Listener> }> = [];
  window.matchMedia = vi.fn((query: string) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1]);
    const entry = { max, listeners: new Set<Listener>() };
    lists.push(entry);
    return {
      get matches() {
        return width <= max;
      },
      media: query,
      addEventListener: (_: string, l: Listener) => entry.listeners.add(l),
      removeEventListener: (_: string, l: Listener) => entry.listeners.delete(l),
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
  return (next: number) => {
    const before = width;
    width = next;
    lists.forEach((l) => {
      if (before <= l.max !== next <= l.max) l.listeners.forEach((fn) => fn());
    });
  };
}

describe('useMaxWidth', () => {
  const original = window.matchMedia;
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    window.matchMedia = original;
  });

  it('is true at the breakpoint and below, false above', () => {
    installMatchMedia(1160);
    expect(renderHook(() => useMaxWidth(1160)).result.current).toBe(true);
    installMatchMedia(1161);
    expect(renderHook(() => useMaxWidth(1160)).result.current).toBe(false);
  });

  it('re-renders only when the breakpoint is crossed', () => {
    const resize = installMatchMedia(1400);
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useMaxWidth(1160);
    });
    const initial = renders;
    act(() => resize(1300));
    act(() => resize(1200));
    expect(renders).toBe(initial);
    act(() => resize(1100));
    expect(result.current).toBe(true);
    act(() => resize(1500));
    expect(result.current).toBe(false);
  });

  it('is false where matchMedia is unavailable', () => {
    // @ts-expect-error simulate an environment without matchMedia
    window.matchMedia = undefined;
    expect(renderHook(() => useMaxWidth(720)).result.current).toBe(false);
  });
});
