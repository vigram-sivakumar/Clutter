/**
 * EditorStateReducer.ts
 * 
 * Central state management with useReducer pattern.
 * 
 * CRITICAL PRINCIPLES:
 * - All state changes go through this reducer
 * - Reducer is pure (no side effects)
 * - Handlers dispatch actions, reducer computes state
 * - Coordinator handles side effects (DOM, observers, etc.)
 * 
 * See: EDITOR-LIFECYCLE-CONTRACT.md
 */

import { useReducer } from 'react';
import type { Node, NodeID } from '../../engine/NodeKernel';
import type {
  EditorStateComplete,
  EditorAction,
  SelectionRange,
} from './EditorTypes';
import {
  handleSegmentedEnter,
  handleSegmentedBackspace,
  mergeWithPrevious,
} from '../../engine/SegmentedEditor';
import { cursorToIndex } from '../EditorModel.index';

/**
 * Editor reducer
 * 
 * Processes actions and returns new state.
 * PURE FUNCTION - no side effects allowed.
 * 
 * @param state - Current state
 * @param action - Action to process
 * @returns New state
 */
export function editorReducer(
  state: EditorStateComplete,
  action: EditorAction
): EditorStateComplete {
  switch (action.type) {
    case 'ENTER_PRESSED': {
      const { cursor, segments, nodes } = action.payload;

      // Find node index by cursor
      const nodeIndex = nodes.findIndex((n) => n.id === cursor.nodeId);
      if (nodeIndex === -1) return state;

      const activeNode = nodes[nodeIndex];
      if (!activeNode) return state;

      // Use fresh segments from DOM
      const activeNodeWithFreshSegments = { ...activeNode, segments };

      // Perform split
      const enterResult = handleSegmentedEnter(
        activeNodeWithFreshSegments,
        cursor
      );

      // Build new node array (index-based insertion)
      const newNodes = [
        ...nodes.slice(0, nodeIndex),
        enterResult.head,
        enterResult.tail,
        ...nodes.slice(nodeIndex + 1),
      ];

      return {
        ...state,
        nodes: newNodes,
        cursor: {
          nodeId: enterResult.tail.id,
          segmentIndex: 0,
          offset: 0,
        },
      };
    }

    case 'BACKSPACE_PRESSED': {
      const { cursor, currentSegments, prevSegments, nodes } = action.payload;

      // Find current node index
      const currentIndex = nodes.findIndex((n) => n.id === cursor.nodeId);
      if (currentIndex === -1) return state;

      const currentNode = nodes[currentIndex];
      if (!currentNode) return state;

      // Update current node with fresh segments
      const currentNodeWithFreshSegments = { ...currentNode, segments: currentSegments };

      // Check if should merge (delegated to segmented editor)
      const result = handleSegmentedBackspace(
        currentNodeWithFreshSegments,
        cursor
      );

      if (result.shouldMergeWithPrevious) {
        // Get previous node
        if (currentIndex === 0) return state; // First node, nothing to merge with

        const prevNode = nodes[currentIndex - 1];
        if (!prevNode) return state;

        // Use fresh segments if provided, otherwise use existing
        const prevNodeWithFreshSegments = prevSegments
          ? { ...prevNode, segments: prevSegments }
          : prevNode;

        // Perform merge
        const merged = mergeWithPrevious(
          prevNodeWithFreshSegments,
          currentNodeWithFreshSegments
        );

        // Remove current node, replace previous with merged
        const withoutCurrent = nodes.filter((n) => n.id !== currentNode.id);
        const newNodes = withoutCurrent.map((n) =>
          n.id === prevNode.id ? merged.merged : n
        );

        return {
          ...state,
          nodes: newNodes,
          cursor: merged.cursor,
        };
      }

      // No merge, just update current node segments
      const newNodes = nodes.map((n) =>
        n.id === currentNode.id ? currentNodeWithFreshSegments : n
      );

      return {
        ...state,
        nodes: newNodes,
      };
    }

    case 'ARROW_PRESSED': {
      const { direction, cursor, nodes } = action.payload;

      // Only handle vertical arrows (up/down)
      // Horizontal arrows are browser-native
      if (direction === 'left' || direction === 'right') {
        return state; // No state change
      }

      // Find current node index
      const currentIndex = nodes.findIndex((n) => n.id === cursor.nodeId);
      if (currentIndex === -1) return state;

      // Compute target index
      let targetIndex: number;
      if (direction === 'up') {
        targetIndex = currentIndex - 1;
        if (targetIndex < 0) return state; // Already at first node
      } else {
        // down
        targetIndex = currentIndex + 1;
        if (targetIndex >= nodes.length) return state; // Already at last node
      }

      const targetNode = nodes[targetIndex];
      if (!targetNode) return state;

      // Move cursor to target node (start of node)
      return {
        ...state,
        cursor: {
          nodeId: targetNode.id,
          segmentIndex: 0,
          offset: 0,
        },
      };
    }

    case 'TAB_PRESSED': {
      const { shiftKey, cursor, nodes } = action.payload;

      // Find current node
      const nodeIndex = nodes.findIndex((n) => n.id === cursor.nodeId);
      if (nodeIndex === -1) return state;

      const currentNode = nodes[nodeIndex];
      if (!currentNode) return state;

      // Compute new indent (bounded 0-10)
      const currentIndent = currentNode.indent || 0;
      const newIndent = shiftKey
        ? Math.max(0, currentIndent - 1) // Outdent
        : Math.min(10, currentIndent + 1); // Indent

      // Update node with new indent
      const newNodes = nodes.map((n) =>
        n.id === currentNode.id ? { ...n, indent: newIndent } : n
      );

      return {
        ...state,
        nodes: newNodes,
      };
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

    case 'COMPOSITION_START': {
      return {
        ...state,
        isComposing: true,
      };
    }

    case 'COMPOSITION_END': {
      return {
        ...state,
        isComposing: false,
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
