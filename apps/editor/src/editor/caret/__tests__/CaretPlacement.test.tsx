/**
 * CaretPlacement.test.tsx
 * 
 * Tests for caret placement hook
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCaretPlacement } from '../CaretPlacement';
import type { Node } from '../../../engine/NodeKernel';
import type { CursorPosition } from '../../../engine/EditorState';

describe('useCaretPlacement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.requestAnimationFrame = vi.fn((cb) => {
      return setTimeout(cb, 16) as unknown as number;
    });
    global.cancelAnimationFrame = vi.fn((id) => {
      clearTimeout(id);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not place caret when needsPlacement is false', () => {
    const needsPlacementRef = { current: false };
    const cursor: CursorPosition = {
      nodeId: 'node-1',
      segmentIndex: 0,
      offset: 0,
    };
    const nodes: Node[] = [
      {
        id: 'node-1',
        segments: [{ type: 'text', text: 'Hello' }],
        props: {},
      } as Node,
    ];

    const querySelectorSpy = vi.spyOn(document, 'querySelector');

    renderHook(() =>
      useCaretPlacement({
        cursor,
        nodes,
        needsPlacementRef,
        debug: false,
      })
    );

    vi.runAllTimers();

    // Should not query DOM when intent flag is false
    expect(querySelectorSpy).not.toHaveBeenCalled();
  });

  it('should attempt placement when needsPlacement is true', () => {
    const needsPlacementRef = { current: true };
    const cursor: CursorPosition = {
      nodeId: 'node-1',
      segmentIndex: 0,
      offset: 0,
    };
    const nodes: Node[] = [
      {
        id: 'node-1',
        segments: [{ type: 'text', text: 'Hello' }],
        props: {},
      } as Node,
    ];

    // Mock DOM element
    const mockElement = document.createElement('div');
    mockElement.setAttribute('data-node-id', 'node-1');
    const textNode = document.createTextNode('Hello');
    mockElement.appendChild(textNode);
    document.body.appendChild(mockElement);

    const querySelectorSpy = vi
      .spyOn(document, 'querySelector')
      .mockReturnValue(mockElement);

    renderHook(() =>
      useCaretPlacement({
        cursor,
        nodes,
        needsPlacementRef,
        debug: false,
      })
    );

    vi.runAllTimers();

    // Should query DOM for node element
    expect(querySelectorSpy).toHaveBeenCalledWith('[data-node-id="node-1"]');

    // Should clear intent flag after placement
    expect(needsPlacementRef.current).toBe(false);

    document.body.removeChild(mockElement);
  });

  it('should retry when DOM element not ready', () => {
    const needsPlacementRef = { current: true };
    const cursor: CursorPosition = {
      nodeId: 'node-1',
      segmentIndex: 0,
      offset: 0,
    };
    const nodes: Node[] = [
      {
        id: 'node-1',
        segments: [{ type: 'text', text: 'Hello' }],
        props: {},
      } as Node,
    ];

    let callCount = 0;
    const querySelectorSpy = vi
      .spyOn(document, 'querySelector')
      .mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return null; // Not ready on first 2 calls
        }
        const mockElement = document.createElement('div');
        mockElement.setAttribute('data-node-id', 'node-1');
        const textNode = document.createTextNode('Hello');
        mockElement.appendChild(textNode);
        return mockElement;
      });

    renderHook(() =>
      useCaretPlacement({
        cursor,
        nodes,
        needsPlacementRef,
        debug: false,
      })
    );

    vi.runAllTimers();

    // Should have retried multiple times (initial + 2 retries + final success = 4 total)
    expect(querySelectorSpy).toHaveBeenCalledTimes(4);

    // Should eventually clear flag
    expect(needsPlacementRef.current).toBe(false);
  });

  it('should abandon after max retries', () => {
    const needsPlacementRef = { current: true };
    const cursor: CursorPosition = {
      nodeId: 'node-1',
      segmentIndex: 0,
      offset: 0,
    };
    const nodes: Node[] = [
      {
        id: 'node-1',
        segments: [{ type: 'text', text: 'Hello' }],
        props: {},
      } as Node,
    ];

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // DOM element never becomes ready
    vi.spyOn(document, 'querySelector').mockReturnValue(null);

    renderHook(() =>
      useCaretPlacement({
        cursor,
        nodes,
        needsPlacementRef,
        debug: false,
        maxRetries: 3, // Use small number for faster test
      })
    );

    vi.runAllTimers();

    // Should log error after max retries
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('CARET PLACEMENT FAILED'),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );

    // Should clear flag even on failure
    expect(needsPlacementRef.current).toBe(false);

    consoleErrorSpy.mockRestore();
  });

  it('should handle missing node in state', () => {
    const needsPlacementRef = { current: true };
    const cursor: CursorPosition = {
      nodeId: 'node-2', // Node doesn't exist
      segmentIndex: 0,
      offset: 0,
    };
    const nodes: Node[] = [
      {
        id: 'node-1',
        segments: [{ type: 'text', text: 'Hello' }],
        props: {},
      } as Node,
    ];

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    renderHook(() =>
      useCaretPlacement({
        cursor,
        nodes,
        needsPlacementRef,
        debug: false,
      })
    );

    vi.runAllTimers();

    // Should log error about missing node
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Target node not in state'),
      expect.anything()
    );

    // Should clear flag
    expect(needsPlacementRef.current).toBe(false);

    consoleErrorSpy.mockRestore();
  });

  it('should cancel placement on unmount', () => {
    const needsPlacementRef = { current: true };
    const cursor: CursorPosition = {
      nodeId: 'node-1',
      segmentIndex: 0,
      offset: 0,
    };
    const nodes: Node[] = [
      {
        id: 'node-1',
        segments: [{ type: 'text', text: 'Hello' }],
        props: {},
      } as Node,
    ];

    // DOM never becomes ready
    vi.spyOn(document, 'querySelector').mockReturnValue(null);

    const { unmount } = renderHook(() =>
      useCaretPlacement({
        cursor,
        nodes,
        needsPlacementRef,
        debug: false,
      })
    );

    // Unmount immediately
    unmount();

    // Run timers to trigger RAF callbacks
    vi.runAllTimers();

    // Flag should still be true (cancelled before clearing)
    expect(needsPlacementRef.current).toBe(true);
  });
});
