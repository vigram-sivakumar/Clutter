/**
 * SelectionHandlers.test.ts
 * 
 * Unit tests for pure selection handlers.
 * 
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleSelectionChange,
  handleBlur,
  handleCompositionStart,
  handleCompositionEnd,
} from '../../keyboard';
import type { EditorStateComplete } from '../../core/EditorTypes';
import type { Node, NodeID } from '../../engine';

// Mock domMapping
vi.mock('../../../selection/domMapping', () => ({
  getNodePositionFromSelection: vi.fn((node: Node) => ({
    nodeId: node.id,
    segmentIndex: 0,
    offset: 0,
  })),
}));

// Helper to create minimal test state
function createTestState(nodeId: NodeID = '1' as NodeID): EditorStateComplete {
  return {
    nodes: [
      {
        id: nodeId,
        indent: 0,
        segments: [{ type: 'text', text: 'Test' }],
      } as Node,
    ],
    cursor: {
      nodeId,
      segmentIndex: 0,
      offset: 0,
    },
    selection: {
      anchor: null,
      focus: null,
    },
    focusRootId: null,
    grammarSession: {
      isActive: false,
      candidates: [],
      selectedIndex: 0,
    },
    isComposing: false,
  };
}

describe('SelectionHandlers', () => {
  let containerEl: HTMLElement;
  let nodeEl: HTMLElement;

  beforeEach(() => {
    // Create DOM structure
    document.body.innerHTML = '';
    containerEl = document.createElement('div');
    containerEl.className = 'editor-container';
    
    nodeEl = document.createElement('div');
    nodeEl.setAttribute('data-node-id', '1');
    
    const contentEl = document.createElement('div');
    contentEl.className = 'node__content';
    contentEl.textContent = 'Test';
    
    nodeEl.appendChild(contentEl);
    containerEl.appendChild(nodeEl);
    document.body.appendChild(containerEl);
  });

  describe('handleSelectionChange', () => {
    it('should return null when structural lock is active', () => {
      const state = createTestState();

      const result = handleSelectionChange(state, containerEl, true);

      expect(result.action).toBeNull();
    });

    it('should return null when no browser selection', () => {
      const state = createTestState();

      // Mock getSelection to return null
      global.window.getSelection = () => null;

      const result = handleSelectionChange(state, containerEl, false);

      expect(result.action).toBeNull();
    });

    it('should return null when selection outside editor', () => {
      const state = createTestState();

      // Create selection outside container
      const outsideNode = document.createElement('div');
      document.body.appendChild(outsideNode);

      const mockSelection = {
        isCollapsed: true,
        anchorNode: outsideNode,
        focusNode: outsideNode,
      } as Selection;

      global.window.getSelection = () => mockSelection;

      const result = handleSelectionChange(state, containerEl, false);

      expect(result.action).toBeNull();
    });

    it('should return null for non-collapsed selection', () => {
      const state = createTestState();

      const mockSelection = {
        isCollapsed: false,
        anchorNode: nodeEl.firstChild,
        focusNode: nodeEl.firstChild,
      } as Selection;

      global.window.getSelection = () => mockSelection;

      const result = handleSelectionChange(state, containerEl, false);

      expect(result.action).toBeNull();
    });

    it('should return SELECTION_CHANGED action for valid selection', () => {
      const state = createTestState();

      const textNode = nodeEl.querySelector('.node__content')?.firstChild;

      const mockSelection = {
        isCollapsed: true,
        anchorNode: textNode,
        focusNode: textNode,
      } as Selection;

      global.window.getSelection = () => mockSelection;

      const result = handleSelectionChange(state, containerEl, false);

      expect(result.action).toBeDefined();
      expect(result.action?.type).toBe('SELECTION_CHANGED');
      expect(result.isStructural).toBe(false);
    });
  });

  describe('handleBlur', () => {
    it('should return BLUR_COMMIT action', () => {
      const state = createTestState();
      const segments = [{ type: 'text' as const, text: 'Updated' }];

      const result = handleBlur(state, '1' as NodeID, segments);

      expect(result.action).toBeDefined();
      expect(result.action?.type).toBe('BLUR_COMMIT');
      expect(result.action?.payload.nodeId).toBe('1' as NodeID);
      expect(result.action?.payload.segments).toBe(segments);
      expect(result.isStructural).toBe(false);
    });
  });

  describe('handleCompositionStart', () => {
    it('should return COMPOSITION_START action', () => {
      const state = createTestState();

      const result = handleCompositionStart(state, '1' as NodeID);

      expect(result.action).toBeDefined();
      expect(result.action?.type).toBe('COMPOSITION_START');
      expect(result.action?.payload.nodeId).toBe('1' as NodeID);
      expect(result.isStructural).toBe(false);
    });
  });

  describe('handleCompositionEnd', () => {
    it('should return COMPOSITION_END action', () => {
      const state = createTestState();

      const result = handleCompositionEnd(state, '1' as NodeID);

      expect(result.action).toBeDefined();
      expect(result.action?.type).toBe('COMPOSITION_END');
      expect(result.action?.payload.nodeId).toBe('1' as NodeID);
      expect(result.isStructural).toBe(false);
    });
  });
});
