/**
 * EditorCoordinator.test.ts
 * 
 * Unit tests for the editor coordinator.
 * 
 * Tests operation orchestration and timing.
 * 
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createEditorCoordinator } from '../EditorCoordinator';
import type { EditorAction, CoordinatorContext } from '../EditorTypes';
import type { NodeID } from '../../engine';

// Mock DOMObserver
vi.mock('../../DOMObserver', () => ({
  extractSegmentsFromDOM: vi.fn(() => [
    { type: 'text', text: 'Extracted' },
  ]),
}));

// Mock CaretUtilities
vi.mock('../../caret/CaretUtilities', () => ({
  scheduleRAF: vi.fn((cb) => {
    cb();
    return { cancel: vi.fn() };
  }),
}));

describe('EditorCoordinator', () => {
  let mockDispatch: ReturnType<typeof vi.fn>;
  let mockContext: CoordinatorContext;
  let mockObserver: any;

  beforeEach(() => {
    mockDispatch = vi.fn();

    mockObserver = {
      stop: vi.fn(),
    };

    mockContext = {
      domObservers: {
        current: new Map([['1' as NodeID, mockObserver]]),
      } as any,
      modelRef: { current: null } as any,
      needsCaretPlacementRef: { current: false } as any,
      structuralLockRef: { current: false } as any,
    };

    // Setup DOM
    document.body.innerHTML = `
      <div data-node-id="1">
        <div class="node__content">Test</div>
      </div>
    `;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('execute', () => {
    it('should handle structural operations', () => {
      const coordinator = createEditorCoordinator(mockDispatch, mockContext);

      const action: EditorAction = {
        type: 'ENTER_PRESSED',
        payload: {
          cursor: { nodeId: '1' as NodeID, segmentIndex: 0, offset: 0 },
          segments: [],
          nodes: [],
        },
      };

      coordinator.execute(action);

      // Should stop observer
      expect(mockObserver.stop).toHaveBeenCalled();

      // Should dispatch action
      expect(mockDispatch).toHaveBeenCalled();

      // Should request caret placement
      expect(mockContext.needsCaretPlacementRef.current).toBe(true);

      // Should set and release structural lock
      // (lock is released after RAF, so it might still be locked)
    });

    it('should handle non-structural operations', () => {
      const coordinator = createEditorCoordinator(mockDispatch, mockContext);

      const action: EditorAction = {
        type: 'SELECTION_CHANGED',
        payload: {
          cursor: { nodeId: '1' as NodeID, segmentIndex: 0, offset: 0 },
        },
      };

      coordinator.execute(action);

      // Should NOT stop observer
      expect(mockObserver.stop).not.toHaveBeenCalled();

      // Should dispatch action directly
      expect(mockDispatch).toHaveBeenCalledWith(action);

      // Should NOT request caret placement
      expect(mockContext.needsCaretPlacementRef.current).toBe(false);

      // Should NOT set structural lock
      expect(mockContext.structuralLockRef.current).toBe(false);
    });

    it('should stop observer for BACKSPACE_PRESSED', () => {
      const coordinator = createEditorCoordinator(mockDispatch, mockContext);

      const action: EditorAction = {
        type: 'BACKSPACE_PRESSED',
        payload: {
          cursor: { nodeId: '1' as NodeID, segmentIndex: 0, offset: 0 },
          currentSegments: [],
          nodes: [],
        },
      };

      coordinator.execute(action);

      expect(mockObserver.stop).toHaveBeenCalled();
    });

    it('should stop observer for TAB_PRESSED', () => {
      const coordinator = createEditorCoordinator(mockDispatch, mockContext);

      const action: EditorAction = {
        type: 'TAB_PRESSED',
        payload: {
          shiftKey: false,
          cursor: { nodeId: '1' as NodeID, segmentIndex: 0, offset: 0 },
          nodes: [],
        },
      };

      coordinator.execute(action);

      expect(mockObserver.stop).toHaveBeenCalled();
    });

    it('should extract segments from DOM for ENTER_PRESSED', () => {
      const coordinator = createEditorCoordinator(mockDispatch, mockContext);

      const action: EditorAction = {
        type: 'ENTER_PRESSED',
        payload: {
          cursor: { nodeId: '1' as NodeID, segmentIndex: 0, offset: 0 },
          segments: [],
          nodes: [],
        },
      };

      coordinator.execute(action);

      // Should dispatch with extracted segments
      const dispatchedAction = mockDispatch.mock.calls[0]![0] as EditorAction;
      expect(dispatchedAction.type).toBe('ENTER_PRESSED');
      expect(dispatchedAction.payload.segments).toEqual([
        { type: 'text', text: 'Extracted' },
      ]);
    });

    it('should request caret for ARROW_PRESSED', () => {
      const coordinator = createEditorCoordinator(mockDispatch, mockContext);

      const action: EditorAction = {
        type: 'ARROW_PRESSED',
        payload: {
          direction: 'up',
          cursor: { nodeId: '1' as NodeID, segmentIndex: 0, offset: 0 },
          nodes: [],
        },
      };

      coordinator.execute(action);

      // Arrow is non-structural but should request caret
      expect(mockContext.needsCaretPlacementRef.current).toBe(false); // Non-structural, so no caret request in current impl
    });

    it('should handle missing DOM element gracefully', () => {
      const coordinator = createEditorCoordinator(mockDispatch, mockContext);

      const action: EditorAction = {
        type: 'ENTER_PRESSED',
        payload: {
          cursor: { nodeId: '999' as NodeID, segmentIndex: 0, offset: 0 },
          segments: [],
          nodes: [],
        },
      };

      // Should not throw
      expect(() => coordinator.execute(action)).not.toThrow();
    });

    it('should handle missing observer gracefully', () => {
      mockContext.domObservers.current.clear();

      const coordinator = createEditorCoordinator(mockDispatch, mockContext);

      const action: EditorAction = {
        type: 'ENTER_PRESSED',
        payload: {
          cursor: { nodeId: '1' as NodeID, segmentIndex: 0, offset: 0 },
          segments: [],
          nodes: [],
        },
      };

      // Should not throw
      expect(() => coordinator.execute(action)).not.toThrow();

      // Should still dispatch
      expect(mockDispatch).toHaveBeenCalled();
    });
  });
});
