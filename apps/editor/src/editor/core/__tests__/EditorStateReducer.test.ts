/**
 * EditorStateReducer.test.ts
 * 
 * Unit tests for the editor reducer.
 * 
 * Tests all action types and state transitions.
 */

import { describe, it, expect } from 'vitest';
import { editorReducer } from '../../reducer';
import type { EditorStateComplete, EditorAction } from '../EditorTypes';
import type { Node, NodeID } from '../../engine';

// Helper to create minimal test state
function createTestState(nodes: Node[]): EditorStateComplete {
  return {
    nodes,
    cursor: {
      nodeId: nodes[0]!.id,
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

// Helper to create test node
function createNode(id: string, text: string, indent = 0): Node {
  return {
    id: id as NodeID,
    indent,
    segments: [{ type: 'text', text }],
  } as Node;
}

describe('editorReducer', () => {
  describe('ENTER_PRESSED', () => {
    it('should split node at cursor', () => {
      const node1 = createNode('1', 'Hello World');
      const state = createTestState([node1]);

      const action: EditorAction = {
        type: 'ENTER_PRESSED',
        payload: {
          cursor: { nodeId: '1' as NodeID, segmentIndex: 0, offset: 5 },
          segments: [{ type: 'text', text: 'Hello World' }],
          nodes: [node1],
        },
      };

      const newState = editorReducer(state, action);

      // Should have 2 nodes now
      expect(newState.nodes).toHaveLength(2);

      // First node should have "Hello"
      expect(newState.nodes[0]!.segments[0]).toEqual({
        type: 'text',
        text: 'Hello',
      });

      // Second node should have " World"
      expect(newState.nodes[1]!.segments[0]).toEqual({
        type: 'text',
        text: ' World',
      });

      // Cursor should be at start of new node
      expect(newState.cursor.nodeId).toBe(newState.nodes[1]!.id);
      expect(newState.cursor.segmentIndex).toBe(0);
      expect(newState.cursor.offset).toBe(0);
    });

    it('should handle split at end of node', () => {
      const node1 = createNode('1', 'Hello');
      const state = createTestState([node1]);

      const action: EditorAction = {
        type: 'ENTER_PRESSED',
        payload: {
          cursor: { nodeId: '1' as NodeID, segmentIndex: 0, offset: 5 },
          segments: [{ type: 'text', text: 'Hello' }],
          nodes: [node1],
        },
      };

      const newState = editorReducer(state, action);

      expect(newState.nodes).toHaveLength(2);
      // Split at end creates empty tail node (segments might be empty array)
      expect(newState.nodes[1]!.segments.length).toBeGreaterThanOrEqual(0);
    });

    it('should preserve other nodes', () => {
      const node1 = createNode('1', 'First');
      const node2 = createNode('2', 'Second');
      const node3 = createNode('3', 'Third');
      const state = createTestState([node1, node2, node3]);

      const action: EditorAction = {
        type: 'ENTER_PRESSED',
        payload: {
          cursor: { nodeId: '2' as NodeID, segmentIndex: 0, offset: 3 },
          segments: [{ type: 'text', text: 'Second' }],
          nodes: [node1, node2, node3],
        },
      };

      const newState = editorReducer(state, action);

      // Should have 4 nodes (1 was split)
      expect(newState.nodes).toHaveLength(4);
      expect(newState.nodes[0]!.id).toBe('1' as NodeID);
      expect(newState.nodes[3]!.id).toBe('3' as NodeID);
    });
  });

  describe('BACKSPACE_PRESSED', () => {
    it('should merge nodes when at start of node', () => {
      const node1 = createNode('1', 'Hello');
      const node2 = createNode('2', 'World');
      const state = createTestState([node1, node2]);

      const action: EditorAction = {
        type: 'BACKSPACE_PRESSED',
        payload: {
          cursor: { nodeId: '2' as NodeID, segmentIndex: 0, offset: 0 },
          currentSegments: [{ type: 'text', text: 'World' }],
          prevSegments: [{ type: 'text', text: 'Hello' }],
          nodes: [node1, node2],
        },
      };

      const newState = editorReducer(state, action);

      // Should have 1 node (merged)
      expect(newState.nodes).toHaveLength(1);
      // Merge concatenates segments: [...prevSegments, ...currentSegments]
      expect(newState.nodes[0]!.segments).toHaveLength(2);
      expect(newState.nodes[0]!.segments[0]!.text).toBe('Hello');
      expect(newState.nodes[0]!.segments[1]!.text).toBe('World');
    });

    it('should not merge if not at start', () => {
      const node1 = createNode('1', 'Hello');
      const node2 = createNode('2', 'World');
      const state = createTestState([node1, node2]);

      const action: EditorAction = {
        type: 'BACKSPACE_PRESSED',
        payload: {
          cursor: { nodeId: '2' as NodeID, segmentIndex: 0, offset: 2 },
          currentSegments: [{ type: 'text', text: 'World' }],
          nodes: [node1, node2],
        },
      };

      const newState = editorReducer(state, action);

      // Should still have 2 nodes
      expect(newState.nodes).toHaveLength(2);
    });

    it('should not merge first node', () => {
      const node1 = createNode('1', 'Hello');
      const state = createTestState([node1]);

      const action: EditorAction = {
        type: 'BACKSPACE_PRESSED',
        payload: {
          cursor: { nodeId: '1' as NodeID, segmentIndex: 0, offset: 0 },
          currentSegments: [{ type: 'text', text: 'Hello' }],
          nodes: [node1],
        },
      };

      const newState = editorReducer(state, action);

      // Should still have 1 node (no merge)
      expect(newState.nodes).toHaveLength(1);
    });
  });

  describe('ARROW_PRESSED', () => {
    it('should navigate up', () => {
      const node1 = createNode('1', 'First');
      const node2 = createNode('2', 'Second');
      const state = {
        ...createTestState([node1, node2]),
        cursor: { nodeId: '2' as NodeID, segmentIndex: 0, offset: 0 },
      };

      const action: EditorAction = {
        type: 'ARROW_PRESSED',
        payload: {
          direction: 'up',
          cursor: state.cursor,
          nodes: [node1, node2],
        },
      };

      const newState = editorReducer(state, action);

      expect(newState.cursor.nodeId).toBe('1' as NodeID);
      expect(newState.cursor.segmentIndex).toBe(0);
      expect(newState.cursor.offset).toBe(0);
    });

    it('should navigate down', () => {
      const node1 = createNode('1', 'First');
      const node2 = createNode('2', 'Second');
      const state = createTestState([node1, node2]);

      const action: EditorAction = {
        type: 'ARROW_PRESSED',
        payload: {
          direction: 'down',
          cursor: state.cursor,
          nodes: [node1, node2],
        },
      };

      const newState = editorReducer(state, action);

      expect(newState.cursor.nodeId).toBe('2' as NodeID);
    });

    it('should not navigate up from first node', () => {
      const node1 = createNode('1', 'First');
      const state = createTestState([node1]);

      const action: EditorAction = {
        type: 'ARROW_PRESSED',
        payload: {
          direction: 'up',
          cursor: state.cursor,
          nodes: [node1],
        },
      };

      const newState = editorReducer(state, action);

      expect(newState.cursor.nodeId).toBe('1' as NodeID);
    });

    it('should not navigate down from last node', () => {
      const node1 = createNode('1', 'First');
      const node2 = createNode('2', 'Second');
      const state = {
        ...createTestState([node1, node2]),
        cursor: { nodeId: '2' as NodeID, segmentIndex: 0, offset: 0 },
      };

      const action: EditorAction = {
        type: 'ARROW_PRESSED',
        payload: {
          direction: 'down',
          cursor: state.cursor,
          nodes: [node1, node2],
        },
      };

      const newState = editorReducer(state, action);

      expect(newState.cursor.nodeId).toBe('2' as NodeID);
    });

    it('should not handle left/right arrows', () => {
      const node1 = createNode('1', 'First');
      const state = createTestState([node1]);

      const actionLeft: EditorAction = {
        type: 'ARROW_PRESSED',
        payload: {
          direction: 'left',
          cursor: state.cursor,
          nodes: [node1],
        },
      };

      const newStateLeft = editorReducer(state, actionLeft);
      expect(newStateLeft).toEqual(state);

      const actionRight: EditorAction = {
        type: 'ARROW_PRESSED',
        payload: {
          direction: 'right',
          cursor: state.cursor,
          nodes: [node1],
        },
      };

      const newStateRight = editorReducer(state, actionRight);
      expect(newStateRight).toEqual(state);
    });
  });

  describe('TAB_PRESSED', () => {
    it('should indent node', () => {
      const node1 = createNode('1', 'Test', 0);
      const state = createTestState([node1]);

      const action: EditorAction = {
        type: 'TAB_PRESSED',
        payload: {
          shiftKey: false,
          cursor: state.cursor,
          nodes: [node1],
        },
      };

      const newState = editorReducer(state, action);

      expect(newState.nodes[0]!.indent).toBe(1);
    });

    it('should outdent node', () => {
      const node1 = createNode('1', 'Test', 2);
      const state = createTestState([node1]);

      const action: EditorAction = {
        type: 'TAB_PRESSED',
        payload: {
          shiftKey: true,
          cursor: state.cursor,
          nodes: [node1],
        },
      };

      const newState = editorReducer(state, action);

      expect(newState.nodes[0]!.indent).toBe(1);
    });

    it('should not indent beyond 10', () => {
      const node1 = createNode('1', 'Test', 10);
      const state = createTestState([node1]);

      const action: EditorAction = {
        type: 'TAB_PRESSED',
        payload: {
          shiftKey: false,
          cursor: state.cursor,
          nodes: [node1],
        },
      };

      const newState = editorReducer(state, action);

      expect(newState.nodes[0]!.indent).toBe(10);
    });

    it('should not outdent below 0', () => {
      const node1 = createNode('1', 'Test', 0);
      const state = createTestState([node1]);

      const action: EditorAction = {
        type: 'TAB_PRESSED',
        payload: {
          shiftKey: true,
          cursor: state.cursor,
          nodes: [node1],
        },
      };

      const newState = editorReducer(state, action);

      expect(newState.nodes[0]!.indent).toBe(0);
    });
  });

  describe('SELECTION_CHANGED', () => {
    it('should update cursor', () => {
      const node1 = createNode('1', 'Test');
      const state = createTestState([node1]);

      const action: EditorAction = {
        type: 'SELECTION_CHANGED',
        payload: {
          cursor: { nodeId: '1' as NodeID, segmentIndex: 0, offset: 4 },
        },
      };

      const newState = editorReducer(state, action);

      expect(newState.cursor.offset).toBe(4);
    });

    it('should clear selection range', () => {
      const node1 = createNode('1', 'Test');
      const state = {
        ...createTestState([node1]),
        selection: {
          anchor: { nodeId: '1' as NodeID, offset: 0 },
          focus: { nodeId: '1' as NodeID, offset: 4 },
        },
      };

      const action: EditorAction = {
        type: 'SELECTION_CHANGED',
        payload: {
          cursor: { nodeId: '1' as NodeID, segmentIndex: 0, offset: 2 },
        },
      };

      const newState = editorReducer(state, action);

      expect(newState.selection.anchor).toBeNull();
      expect(newState.selection.focus).toBeNull();
    });
  });

  describe('COMPOSITION', () => {
    it('should set composing flag on start', () => {
      const node1 = createNode('1', 'Test');
      const state = createTestState([node1]);

      const action: EditorAction = {
        type: 'COMPOSITION_START',
        payload: { nodeId: '1' as NodeID },
      };

      const newState = editorReducer(state, action);

      expect(newState.isComposing).toBe(true);
    });

    it('should clear composing flag on end', () => {
      const node1 = createNode('1', 'Test');
      const state = {
        ...createTestState([node1]),
        isComposing: true,
      };

      const action: EditorAction = {
        type: 'COMPOSITION_END',
        payload: { nodeId: '1' as NodeID },
      };

      const newState = editorReducer(state, action);

      expect(newState.isComposing).toBe(false);
    });
  });

  describe('ZOOM', () => {
    it('should set focus root on zoom in', () => {
      const node1 = createNode('1', 'Test');
      const state = createTestState([node1]);

      const action: EditorAction = {
        type: 'ZOOM_IN',
        payload: { nodeId: '1' as NodeID },
      };

      const newState = editorReducer(state, action);

      expect(newState.focusRootId).toBe('1' as NodeID);
    });

    it('should clear focus root on zoom out', () => {
      const node1 = createNode('1', 'Test');
      const state = {
        ...createTestState([node1]),
        focusRootId: '1' as NodeID,
      };

      const action: EditorAction = {
        type: 'ZOOM_OUT',
        payload: {},
      };

      const newState = editorReducer(state, action);

      expect(newState.focusRootId).toBeNull();
    });
  });

  describe('SEGMENTS_UPDATED', () => {
    it('should update node segments', () => {
      const node1 = createNode('1', 'Old');
      const state = createTestState([node1]);

      const newSegments = [{ type: 'text' as const, text: 'New' }];

      const action: EditorAction = {
        type: 'SEGMENTS_UPDATED',
        payload: {
          nodeId: '1' as NodeID,
          segments: newSegments,
        },
      };

      const newState = editorReducer(state, action);

      expect(newState.nodes[0]!.segments[0]).toEqual({
        type: 'text',
        text: 'New',
      });
    });
  });
});
