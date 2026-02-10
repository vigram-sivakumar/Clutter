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

/**
 * Handle Space key press
 * 
 * Detects markdown triggers ([], -, #) and converts node variant.
 * 
 * CRITICAL: Must extract segments BEFORE calling this handler.
 * This handler is DOM-first - it reads extracted segments, not live DOM.
 * 
 * @param state - Current editor state
 * @param event - Keyboard event
 * @param segments - Segments extracted from DOM (REQUIRED)
 * @param isComposing - Whether IME composition is active
 * @returns Handler result with MARKDOWN_TRIGGER action or null
 */
export function handleSpace(
  state: EditorStateComplete,
  event: React.KeyboardEvent,
  segments: Segment[],
  isComposing: boolean
): HandlerResult {
  // Guard: composition
  if (isComposing) return { action: null };

  // Guard: grammar session active (Space has special meaning in grammar mode)
  if (state.grammarSession.isActive) return { action: null };

  // Get plain text from segments
  const plainText = segments.map(s => s.type === 'text' ? s.text : '').join('');
  const offset = getCursorOffsetInPlainText(segments, state.cursor);
  const textBefore = plainText.slice(0, offset);

  // Detect markdown triggers at cursor position
  // Pattern: trigger text must be exactly what's before cursor (no extra text)
  
  // Task variant: []␣
  if (textBefore === '[]') {
    return {
      action: {
        type: 'MARKDOWN_TRIGGER',
        payload: {
          trigger: '[]',
          newVariant: 'task',
          nodeId: state.cursor.nodeId,
          clearedSegments: [], // Empty node after removing trigger
        },
      },
      preventDefault: true,
      stopPropagation: false,
      isStructural: true,
      requestCaret: true,
    };
  }

  // Bullet variant: -␣
  if (textBefore === '-') {
    return {
      action: {
        type: 'MARKDOWN_TRIGGER',
        payload: {
          trigger: '-',
          newVariant: 'bullet',
          nodeId: state.cursor.nodeId,
          clearedSegments: [], // Empty node after removing trigger
        },
      },
      preventDefault: true,
      stopPropagation: false,
      isStructural: true,
      requestCaret: true,
    };
  }

  // Heading variant: #␣
  if (textBefore === '#') {
    return {
      action: {
        type: 'MARKDOWN_TRIGGER',
        payload: {
          trigger: '#',
          newVariant: 'heading-1',
          nodeId: state.cursor.nodeId,
          clearedSegments: [], // Empty node after removing trigger
        },
      },
      preventDefault: true,
      stopPropagation: false,
      isStructural: true,
      requestCaret: true,
    };
  }

  // No markdown trigger detected - let browser handle space normally
  return { action: null };
}

/**
 * Handle Colon key press
 * 
 * Opens property editor when typed at start of empty node.
 * 
 * CRITICAL: Must extract segments BEFORE calling this handler.
 * 
 * @param state - Current editor state
 * @param event - Keyboard event
 * @param segments - Segments extracted from DOM (REQUIRED)
 * @param isComposing - Whether IME composition is active
 * @returns Handler result with PROPERTY_EDITOR_OPEN action or null
 */
export function handleColon(
  state: EditorStateComplete,
  event: React.KeyboardEvent,
  segments: Segment[],
  isComposing: boolean
): HandlerResult {
  // Guard: composition
  if (isComposing) return { action: null };

  // Guard: cursor not at start
  if (state.cursor.offset !== 0) return { action: null };

  // Guard: node not empty
  const plainText = segments.map(s => s.type === 'text' ? s.text : '').join('');
  const isEmpty = plainText.trim() === '';
  if (!isEmpty) return { action: null };

  // Trigger property editor
  return {
    action: {
      type: 'PROPERTY_EDITOR_OPEN',
      payload: {
        nodeId: state.cursor.nodeId,
      },
    },
    preventDefault: true,
    stopPropagation: false,
    isStructural: false, // UI action, not structural mutation
    requestCaret: false,
  };
}
