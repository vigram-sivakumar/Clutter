/**
 * ObserverLifecycle.test.tsx
 * 
 * Tests for observer lifecycle hook
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useObserverLifecycle } from '../ObserverLifecycle';
import { DOMObserver } from '../../DOMObserver';

// Mock DOMObserver
vi.mock('../../DOMObserver', () => {
  const mockObserverClass = vi.fn(function (this: any) {
    this.start = vi.fn();
    this.stop = vi.fn();
    this.destroy = vi.fn();
    this.isRunning = vi.fn().mockReturnValue(false);
    this.clearPendingMutations = vi.fn();
  });

  return {
    DOMObserver: mockObserverClass,
  };
});

describe('useObserverLifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.requestAnimationFrame = vi.fn((cb) => {
      return setTimeout(cb, 16) as unknown as number;
    });
    global.cancelAnimationFrame = vi.fn((id) => {
      clearTimeout(id);
    });
    // Mock querySelector to return fake elements
    document.querySelector = vi.fn((selector) => {
      if (selector.includes('data-node-id')) {
        return document.createElement('div');
      }
      return null;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should create observers for all node IDs', () => {
    const { result } = renderHook(() =>
      useObserverLifecycle({
        nodeIds: ['node-1', 'node-2', 'node-3'],
      })
    );

    // Wait for RAF to execute
    vi.runAllTimers();

    expect(result.current.observers.current.size).toBe(3);
    expect(result.current.observers.current.has('node-1')).toBe(true);
    expect(result.current.observers.current.has('node-2')).toBe(true);
    expect(result.current.observers.current.has('node-3')).toBe(true);
  });

  it('should call start() on each observer', () => {
    renderHook(() =>
      useObserverLifecycle({
        nodeIds: ['node-1', 'node-2'],
      })
    );

    vi.runAllTimers();

    // DOMObserver should be called for each node
    expect(DOMObserver).toHaveBeenCalledTimes(2);

    // Each observer should have start() called
    const mockInstances = (DOMObserver as any).mock.results.map(
      (r: any) => r.value
    );
    mockInstances.forEach((instance: any) => {
      expect(instance.start).toHaveBeenCalled();
    });
  });

  it('should not create duplicate observers for same node', () => {
    const { rerender } = renderHook(
      ({ nodeIds }) => useObserverLifecycle({ nodeIds }),
      {
        initialProps: { nodeIds: ['node-1', 'node-2'] },
      }
    );

    vi.runAllTimers();

    expect(DOMObserver).toHaveBeenCalledTimes(2);

    // Rerender with same nodes
    rerender({ nodeIds: ['node-1', 'node-2'] });
    vi.runAllTimers();

    // Should not create new observers
    expect(DOMObserver).toHaveBeenCalledTimes(2);
  });

  it('should destroy observers on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useObserverLifecycle({
        nodeIds: ['node-1', 'node-2'],
      })
    );

    vi.runAllTimers();

    const observers = result.current.observers.current;
    const observerInstances = Array.from(observers.values());

    unmount();

    // Each observer should have destroy() called
    observerInstances.forEach((instance) => {
      expect(instance.destroy).toHaveBeenCalled();
    });
  });

  it('should call onMutationsBatched callback when provided', () => {
    const callback = vi.fn();

    renderHook(() =>
      useObserverLifecycle({
        nodeIds: ['node-1'],
        onMutationsBatched: callback,
      })
    );

    vi.runAllTimers();

    // DOMObserver should be created with callback
    expect(DOMObserver).toHaveBeenCalledWith(
      expect.objectContaining({
        onMutationsBatched: expect.any(Function),
      })
    );
  });

  it('should skip nodes without DOM elements', () => {
    document.querySelector = vi.fn(() => null);

    const { result } = renderHook(() =>
      useObserverLifecycle({
        nodeIds: ['node-1', 'node-2'],
      })
    );

    vi.runAllTimers();

    // No observers should be created
    expect(result.current.observers.current.size).toBe(0);
  });
});
