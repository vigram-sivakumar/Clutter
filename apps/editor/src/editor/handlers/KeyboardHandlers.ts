/**
 * KeyboardHandlers.ts
 * 
 * Pure keyboard event handlers.
 * 
 * CRITICAL PRINCIPLES:
 * - Handlers are PURE functions
 * - No state mutations
 * - No side effects
 * - Return actions + metadata
 * 
 * CONTRACT:
 * - Input: current state + event
 * - Output: action to dispatch (or null)
 * - Coordinator handles orchestration
 */

import type { EditorStateComplete, HandlerResult } from '../core/EditorTypes';
import {
  getCursorOffsetInPlainText,
  findSegmentAtPlainTextOffset,
} from '../../engine/SegmentUtils';

/**
 * Handle Enter key press
 * 
 * Creates action for node splitting.
 * 
 * @param state - Current editor state
 * @param event - Keyboard event
 * @param isComposing - Whether IME composition is active
 * @returns Handler result with ENTER_PRESSED action
 */
export function handleEnter(
  state: EditorStateComplete,
  event: React.KeyboardEvent,
  isComposing: boolean
): HandlerResult {
  // Guard: composition
  if (isComposing) return { action: null };

  // Guard: repeat
  if (event.repeat) return { action: null };

  // Return action for coordinator to handle
  return {
    action: {
      type: 'ENTER_PRESSED',
      payload: {
        cursor: state.cursor,
        segments: [], // Will be filled by coordinator from DOM
        nodes: state.nodes,
      },
    },
    preventDefault: true,
    stopPropagation: true,
    isStructural: true,
    requestCaret: true,
  };
}

/**
 * Handle Backspace key press
 * 
 * Creates action for node merging or text deletion.
 * 
 * @param state - Current editor state
 * @param event - Keyboard event
 * @param isComposing - Whether IME composition is active
 * @returns Handler result with BACKSPACE_PRESSED action
 */
export function handleBackspace(
  state: EditorStateComplete,
  event: React.KeyboardEvent,
  isComposing: boolean
): HandlerResult {
  // Guard: composition
  if (isComposing) return { action: null };

  // Guard: repeat
  if (event.repeat) return { action: null };

  // Guard: selection (browser handles deletion)
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) {
    return { action: null };
  }

  // Return action for coordinator
  return {
    action: {
      type: 'BACKSPACE_PRESSED',
      payload: {
        cursor: state.cursor,
        currentSegments: [], // Will be filled by coordinator from DOM
        nodes: state.nodes,
      },
    },
    isStructural: true,
    requestCaret: true,
  };
}

/**
 * Compute target cursor with offset preservation
 * 
 * ROBUST IMPLEMENTATION:
 * - Handles inline elements correctly (zero-width)
 * - Handles shorter target lines (clamps to end)
 * - Handles empty nodes
 * - Pure function, no side effects
 * 
 * USAGE:
 * - Called by NodeEditor during ArrowUp/Down navigation
 * - Will be moved into handleArrow() when migration completes
 * 
 * @param currentSegments - Current node segments
 * @param targetSegments - Target node segments
 * @param targetNodeId - Target node ID
 * @param currentCursor - Current cursor position (segmentIndex, offset)
 * @returns Target cursor position with preserved offset
 */
export function computeArrowTargetCursor(
  currentSegments: any[],
  targetSegments: any[],
  targetNodeId: string,
  currentCursor: { segmentIndex: number; offset: number }
): { nodeId: string; segmentIndex: number; offset: number } {
  // Step 1: Get current cursor position as plain text offset
  // This handles inline elements correctly (they are zero-width)
  const currentPlainTextOffset = getCursorOffsetInPlainText(
    currentSegments,
    currentCursor
  );

  // Step 2: Map that offset to the target node's segment structure
  // This returns the CORRECT segmentIndex and offset for the target node
  // Handles cases: shorter lines, inline elements, empty nodes
  const targetPosition = findSegmentAtPlainTextOffset(
    targetSegments,
    currentPlainTextOffset
  );

  return {
    nodeId: targetNodeId,
    segmentIndex: targetPosition.segmentIndex,
    offset: targetPosition.offset,
  };
}

/**
 * Handle Arrow key press
 * 
 * Creates action for cursor navigation.
 * 
 * NOTE: Target node determination happens in NodeEditor during migration.
 * When migration completes, this will move entirely into handleArrow().
 * 
 * @param state - Current editor state
 * @param event - Keyboard event
 * @returns Handler result with ARROW_PRESSED action
 */
export function handleArrow(
  state: EditorStateComplete,
  event: React.KeyboardEvent
): HandlerResult {
  const direction = event.key.replace('Arrow', '').toLowerCase() as
    | 'up'
    | 'down'
    | 'left'
    | 'right';

  // Only handle vertical arrows (up/down)
  // Horizontal arrows are browser-native
  if (direction === 'left' || direction === 'right') {
    return { action: null };
  }

  // Return action for coordinator
  return {
    action: {
      type: 'ARROW_PRESSED',
      payload: {
        direction,
        cursor: state.cursor,
        nodes: state.nodes,
      },
    },
    preventDefault: true,
    isStructural: false,
    requestCaret: true,
  };
}

/**
 * Handle Tab key press
 * 
 * Creates action for indent/outdent.
 * 
 * @param state - Current editor state
 * @param event - Keyboard event
 * @returns Handler result with TAB_PRESSED action
 */
export function handleTab(
  state: EditorStateComplete,
  event: React.KeyboardEvent
): HandlerResult {
  return {
    action: {
      type: 'TAB_PRESSED',
      payload: {
        shiftKey: event.shiftKey,
        cursor: state.cursor,
        nodes: state.nodes,
      },
    },
    preventDefault: true,
    isStructural: true,
    requestCaret: false, // Tab doesn't move cursor
  };
}

/**
 * Master keyboard handler
 * 
 * Routes keyboard events to specific handlers.
 * 
 * @param state - Current editor state
 * @param event - Keyboard event
 * @param isComposing - Whether IME composition is active
 * @returns Handler result
 */
export function handleKeyboardEvent(
  state: EditorStateComplete,
  event: React.KeyboardEvent,
  isComposing: boolean
): HandlerResult {
  switch (event.key) {
    case 'Enter':
      return handleEnter(state, event, isComposing);

    case 'Backspace':
      return handleBackspace(state, event, isComposing);

    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight':
      return handleArrow(state, event);

    case 'Tab':
      return handleTab(state, event);

    default:
      return { action: null };
  }
}
