/**
 * ObserverCommit.test.ts
 * 
 * Tests for commit boundary operations
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  performCommitBoundary,
  getNodePositionFromSelection,
  assertObserverStopped,
} from '../ObserverCommit';
import type { Node, Segment } from '../../../engine/NodeKernel';

// Mock extractSegmentsFromDOM
vi.mock('../../DOMObserver', () => ({
  extractSegmentsFromDOM: vi.fn(() => [
    { type: 'text', text: 'Hello world' },
  ] as Segment[]),
}));

describe('ObserverCommit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('performCommitBoundary', () => {
    it('should stop observer and extract segments', () => {
      const mockObserver = {
        stop: vi.fn(),
        clearPendingMutations: vi.fn(),
        start: vi.fn(),
        destroy: vi.fn(),
        isRunning: vi.fn().mockReturnValue(false),
      };

      const observers = new Map([['node-1', mockObserver]]);
      const element = document.createElement('div');
      element.setAttribute('data-node-id', 'node-1');

      const getNodeFromSegments = (nodeId: string, segments: Segment[]): Node => ({
        id: nodeId,
        segments,
        props: {},
      } as Node);

      const result = performCommitBoundary(
        'node-1',
        element,
        observers,
        getNodeFromSegments
      );

      expect(mockObserver.stop).toHaveBeenCalled();
      expect(mockObserver.clearPendingMutations).toHaveBeenCalled();
      expect(result.segments).toBeDefined();
      expect(result.observerWasStopped).toBe(true);
    });

    it('should handle missing observer gracefully', () => {
      const observers = new Map();
      const element = document.createElement('div');
      const getNodeFromSegments = (nodeId: string, segments: Segment[]): Node => ({
        id: nodeId,
        segments,
        props: {},
      } as Node);

      const result = performCommitBoundary(
        'node-1',
        element,
        observers,
        getNodeFromSegments
      );

      expect(result.observerWasStopped).toBe(false);
      expect(result.segments).toBeDefined();
    });
  });

  describe('getNodePositionFromSelection', () => {
    it('should return null when no selection', () => {
      window.getSelection = vi.fn(() => null);

      const node: Node = {
        id: 'node-1',
        segments: [{ type: 'text', text: 'Hello' }],
        indent: 0,
        props: {},
      };

      const result = getNodePositionFromSelection(node);
      expect(result).toBeNull();
    });

    it('should return null when selection has no focus node', () => {
      window.getSelection = vi.fn(
        () =>
          ({
            focusNode: null,
            focusOffset: 0,
          }) as any
      );

      const node: Node = {
        id: 'node-1',
        segments: [{ type: 'text', text: 'Hello' }],
        indent: 0,
        props: {},
      };

      const result = getNodePositionFromSelection(node);
      expect(result).toBeNull();
    });

    it('should return null when selection is outside node', () => {
      const outsideElement = document.createElement('div');
      const textNode = document.createTextNode('Outside');
      outsideElement.appendChild(textNode);

      window.getSelection = vi.fn(
        () =>
          ({
            focusNode: textNode,
            focusOffset: 0,
          }) as any
      );

      document.querySelector = vi.fn(() => {
        const element = document.createElement('div');
        element.setAttribute('data-node-id', 'node-1');
        return element;
      });

      const node: Node = {
        id: 'node-1',
        segments: [{ type: 'text', text: 'Hello' }],
        indent: 0,
        props: {},
      };

      const result = getNodePositionFromSelection(node);
      expect(result).toBeNull();
    });
  });

  describe('assertObserverStopped', () => {
    it('should return true when observer is stopped', () => {
      const mockObserver = {
        isRunning: vi.fn().mockReturnValue(false),
        stop: vi.fn(),
        start: vi.fn(),
        destroy: vi.fn(),
        clearPendingMutations: vi.fn(),
      };

      const observers = new Map([['node-1', mockObserver]]);

      const result = assertObserverStopped('node-1', observers);
      expect(result).toBe(true);
    });

    it('should return false and warn when observer is running', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const mockObserver = {
        isRunning: vi.fn().mockReturnValue(true),
        stop: vi.fn(),
        start: vi.fn(),
        destroy: vi.fn(),
        clearPendingMutations: vi.fn(),
      };

      const observers = new Map([['node-1', mockObserver]]);

      const result = assertObserverStopped('node-1', observers);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
      const callArgs = consoleSpy.mock.calls[0];
      expect(callArgs).toBeDefined();
      expect(callArgs![0]).toContain('OBSERVER STILL RUNNING');

      consoleSpy.mockRestore();
    });

    it('should return true when observer does not exist', () => {
      const observers = new Map();
      const result = assertObserverStopped('node-1', observers);
      expect(result).toBe(true);
    });
  });
});
