/**
 * SelectionHandlers.ts
 * 
 * Pure selection event handlers.
 * 
 * CRITICAL PRINCIPLES:
 * - Handlers are PURE functions
 * - No state mutations
 * - No side effects
 * - Return actions + metadata
 * 
 * CONTRACT:
 * - Input: current state + DOM selection
 * - Output: action to dispatch (or null)
 * - Coordinator handles orchestration
 */

import type { Node, NodeID } from '../../engine/NodeKernel';
import type { EditorStateComplete, HandlerResult } from '../core/EditorTypes';
import { getNodePositionFromSelection } from './domMapping';

/**
 * Handle selection change
 * 
 * Creates action for cursor position update.
 * 
 * @param state - Current editor state
 * @param containerEl - Editor container element
 * @param structuralLock - Whether structural operation is in progress
 * @returns Handler result with SELECTION_CHANGED action
 */
export function handleSelectionChange(
  state: EditorStateComplete,
  containerEl: HTMLElement,
  structuralLock: boolean
): HandlerResult {
  // Guard: structural lock (ignore during commits)
  if (structuralLock) return { action: null };

  const browserSelection = window.getSelection();
  if (!browserSelection) return { action: null };

  // Guard: selection outside editor
  const anchorIn = containerEl.contains(browserSelection.anchorNode);
  const focusIn = containerEl.contains(browserSelection.focusNode);
  if (!anchorIn || !focusIn) return { action: null };

  // Guard: non-collapsed selection (range selection)
  if (!browserSelection.isCollapsed) {
    // TODO: Handle range selections
    return { action: null };
  }

  // Extract cursor position from DOM
  const anchorNode = browserSelection.anchorNode;
  if (!anchorNode) return { action: null };

  // Find which node the selection is in
  let currentNodeElement = anchorNode.parentElement;
  while (currentNodeElement && !currentNodeElement.hasAttribute('data-node-id')) {
    currentNodeElement = currentNodeElement.parentElement;
  }

  if (!currentNodeElement) return { action: null };

  const nodeId = currentNodeElement.getAttribute('data-node-id') as NodeID;
  if (!nodeId) return { action: null };

  // Find the node in state
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) return { action: null };

  // Extract position using domMapping
  const position = getNodePositionFromSelection(node);
  if (!position) return { action: null };

  // Return action for coordinator
  return {
    action: {
      type: 'SELECTION_CHANGED',
      payload: {
        cursor: position,
      },
    },
    isStructural: false,
  };
}

/**
 * Handle blur (when node loses focus)
 * 
 * Creates action for committing segments from DOM.
 * 
 * @param state - Current editor state
 * @param nodeId - ID of node being blurred
 * @param segments - Fresh segments extracted from DOM
 * @returns Handler result with BLUR_COMMIT action
 */
export function handleBlur(
  state: EditorStateComplete,
  nodeId: NodeID,
  segments: Node['segments']
): HandlerResult {
  return {
    action: {
      type: 'BLUR_COMMIT',
      payload: {
        nodeId,
        segments,
      },
    },
    isStructural: false,
  };
}

/**
 * Handle composition start (IME input)
 * 
 * Creates action for marking composition active.
 * 
 * @param state - Current editor state
 * @param nodeId - ID of node where composition started
 * @returns Handler result with COMPOSITION_START action
 */
export function handleCompositionStart(
  state: EditorStateComplete,
  nodeId: NodeID
): HandlerResult {
  return {
    action: {
      type: 'COMPOSITION_START',
      payload: {
        nodeId,
      },
    },
    isStructural: false,
  };
}

/**
 * Handle composition end (IME input)
 * 
 * Creates action for marking composition inactive.
 * 
 * @param state - Current editor state
 * @param nodeId - ID of node where composition ended
 * @returns Handler result with COMPOSITION_END action
 */
export function handleCompositionEnd(
  state: EditorStateComplete,
  nodeId: NodeID
): HandlerResult {
  return {
    action: {
      type: 'COMPOSITION_END',
      payload: {
        nodeId,
      },
    },
    isStructural: false,
  };
}
