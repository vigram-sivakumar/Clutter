// reducer.ts
// Owns all state transitions (single source of truth)

/**
 * Pure state computation layer.
 * 
 * CRITICAL RULES:
 * - Reducer MUST be pure: (state, action) → nextState
 * - NO side effects
 * - NO DOM access
 * - NO observer manipulation
 * - NO React hooks
 * - NO timing/async logic
 * 
 * The reducer computes the NEXT state.
 * The coordinator applies it.
 * 
 * This is the single source of truth for state transitions.
 */

import { useReducer } from 'react';
import type { Node, NodeID, Segment, NodeVariant } from './engine';
import type {
  EditorStateComplete,
  EditorAction,
  SelectionRange,
} from './core/EditorTypes';
import {
  handleSegmentedEnter,
  handleSegmentedBackspace,
  mergeWithPrevious,
} from './engine';

/**
 * Ensure a node has at least one segment for cursor placement
 * 
 * Empty nodes (0 segments) break CaretPlacement because it can't find
 * a text node to place the cursor in. This function normalizes nodes
 * by adding an empty text segment if needed.
 * 
 * @param node - Node to normalize
 * @returns Node with at least one segment
 */
function normalizeEmptyNode(node: Node): Node {
  if (node.segments.length === 0) {
    return {
      ...node,
      segments: [{ type: 'text', text: '' }] as Segment[],
    };
  }
  return node;
}

/**
 * Main reducer: computes next state from current state + action
 * 
 * Merged from EditorReducer + EditorStateReducer.
 * All action types unified into single switch.
 * 
 * @param state - Current editor state
 * @param action - Action to apply
 * @returns Next editor state
 */
export function editorReducer(
  state: EditorStateComplete,
  action: EditorAction
): EditorStateComplete {
  switch (action.type) {
    case 'ENTER_PRESSED': {
      const { cursor, segments, nodes } = action.payload;

      // Find current node
      const nodeIndex = nodes.findIndex((n) => n.id === cursor.nodeId);
      if (nodeIndex === -1) return state;

      const currentNode = nodes[nodeIndex];
      if (!currentNode) return state;

      // Update node with fresh segments (from DOM extraction)
      const nodeWithFreshSegments: Node = {
        ...currentNode,
        segments,
      };

      // Compute split using battle-tested SegmentedEditor logic
      const splitResult = handleSegmentedEnter(nodeWithFreshSegments, cursor);

      // Normalize empty nodes (required for CaretPlacement)
      const normalizedHead = normalizeEmptyNode(splitResult.head);
      const normalizedTail = normalizeEmptyNode(splitResult.tail);

      // Insert tail node after current node
      const updatedNodes = [
        ...nodes.slice(0, nodeIndex),
        normalizedHead,
        normalizedTail,
        ...nodes.slice(nodeIndex + 1),
      ];

      // Return new state with cursor at start of tail node
      return {
        ...state,
        nodes: updatedNodes,
        cursor: splitResult.cursor,
      };
    }

    case 'BACKSPACE_PRESSED': {
      const { cursor, segments, nodes } = action.payload;

      // Find current node
      const currentIndex = nodes.findIndex((n) => n.id === cursor.nodeId);
      if (currentIndex === -1) return state;

      const currentNode = nodes[currentIndex];
      if (!currentNode) return state;

      // Update node with fresh segments
      const nodeWithFreshSegments: Node = {
        ...currentNode,
        segments,
      };

      // Compute deletion using battle-tested SegmentedEditor logic
      const backspaceResult = handleSegmentedBackspace(nodeWithFreshSegments, cursor, nodes);

      if (backspaceResult.mergeResult) {
        // Node merge
        const normalizedMerged = normalizeEmptyNode(backspaceResult.mergeResult.merged);
        
        const updatedNodes = [
          ...nodes.slice(0, currentIndex - 1),
          normalizedMerged,
          ...nodes.slice(currentIndex + 1),
        ];
        return {
          ...state,
          nodes: updatedNodes,
          cursor: backspaceResult.mergeResult.cursor,
        };
      } else if (backspaceResult.updated) {
        // Character deletion
        const normalizedNode = normalizeEmptyNode(backspaceResult.updated);
        
        const updatedNodes = nodes.map((n) =>
          n.id === cursor.nodeId ? normalizedNode : n
        );
        
        return {
          ...state,
          nodes: updatedNodes,
          cursor: backspaceResult.cursor,
        };
      }

      return state;
    }

    case 'TAB_PRESSED': {
      const { nodeId, shiftKey } = action.payload;

      const updatedNodes = state.nodes.map((node) => {
        if (node.id !== nodeId) return node;

        const currentIndent = (node as any).indent || 0;
        const newIndent = shiftKey
          ? Math.max(0, currentIndent - 1)
          : Math.min(10, currentIndent + 1);

        return { ...node, indent: newIndent } as any;
      });

      return {
        ...state,
        nodes: updatedNodes,
      };
    }

    case 'ARROW_PRESSED': {
      const { cursor } = action.payload;

      return {
        ...state,
        cursor,
      };
    }

    case 'MARKDOWN_TRIGGER': {
      const { nodeId, newVariant, clearedSegments } = action.payload;

      const updatedNodes = state.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        return { 
          ...node, 
          segments: clearedSegments,
          props: { ...node.props, variant: newVariant }
        };
      });

      return {
        ...state,
        nodes: updatedNodes,
        cursor: {
          nodeId,
          segmentIndex: 0,
          offset: 0,
        },
      };
    }

    case 'PROPERTY_EDITOR_OPEN': {
      // Property editor is UI-only, no state change
      return state;
    }

    case 'SELECTION_CHANGED': {
      return {
        ...state,
        cursor: action.payload.cursor,
        selection: { anchor: null, focus: null }, // Clear selection range
      };
    }

    case 'SELECTION_RANGE_CHANGED': {
      return {
        ...state,
        cursor: action.payload.cursor,
        selection: action.payload.selection,
      };
    }

    case 'BLUR_COMMIT': {
      const { nodeId, segments, cursor } = action.payload;

      // Update node with fresh segments
      const newNodes = state.nodes.map((n) =>
        n.id === nodeId ? { ...n, segments } : n
      );

      return {
        ...state,
        nodes: newNodes,
        cursor: cursor || state.cursor,
      };
    }

    case 'SEGMENTS_UPDATED': {
      const { nodeId, segments } = action.payload;

      // Update node with fresh segments
      const newNodes = state.nodes.map((n) =>
        n.id === nodeId ? { ...n, segments } : n
      );

      return {
        ...state,
        nodes: newNodes,
      };
    }

    case 'COMPOSITION_START':
    case 'COMPOSITION_END': {
      return {
        ...state,
        isComposing: action.type === 'COMPOSITION_START',
      };
    }

    case 'ZOOM_IN': {
      return {
        ...state,
        focusRootId: action.payload.nodeId,
      };
    }

    case 'ZOOM_OUT': {
      return {
        ...state,
        focusRootId: null,
      };
    }

    case 'GRAMMAR_SESSION_START': {
      return {
        ...state,
        grammarSession: action.payload.session,
      };
    }

    case 'GRAMMAR_SESSION_UPDATE': {
      return {
        ...state,
        grammarSession: action.payload.session,
      };
    }

    case 'GRAMMAR_SESSION_CANCEL': {
      return {
        ...state,
        grammarSession: {
          isActive: false,
          candidates: [],
          selectedIndex: 0,
        },
      };
    }

    default:
      // Unknown action - return state unchanged
      return state;
  }
}

/**
 * Hook for editor state management
 * 
 * Wraps useReducer with the editor reducer.
 * 
 * @param initialState - Initial editor state
 * @returns [state, dispatch] tuple
 */
export function useEditorStateReducer(initialState: EditorStateComplete) {
  return useReducer(editorReducer, initialState);
}

/**
 * Validate state invariants
 * 
 * Guards against invalid state that could break the editor.
 * Called by coordinator after reducer computes next state.
 * 
 * @param state - State to validate
 * @throws Error if state violates invariants
 */
export function validateEditorState(state: EditorStateComplete): void {
  // Invariant 1: Cursor must point to existing node
  const cursorNodeExists = state.nodes.some((n) => n.id === state.cursor.nodeId);
  if (!cursorNodeExists) {
    throw new Error(
      `[Reducer Invariant] Cursor points to non-existent node: ${state.cursor.nodeId}`
    );
  }

  // Invariant 2: Cursor offset must be valid
  const cursorNode = state.nodes.find((n) => n.id === state.cursor.nodeId);
  if (cursorNode) {
    const segmentCount = cursorNode.segments.length;
    if (state.cursor.segmentIndex > segmentCount) {
      throw new Error(
        `[Reducer Invariant] Cursor segmentIndex ${state.cursor.segmentIndex} exceeds segment count ${segmentCount}`
      );
    }
  }

  // Invariant 3: All nodes must have unique IDs
  const nodeIds = state.nodes.map((n) => n.id);
  const uniqueIds = new Set(nodeIds);
  if (nodeIds.length !== uniqueIds.size) {
    throw new Error('[Reducer Invariant] Duplicate node IDs detected');
  }
}
