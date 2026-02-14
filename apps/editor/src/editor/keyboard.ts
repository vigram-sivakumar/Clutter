// keyboard.ts
// Owns all browser input → EditorAction mapping

/**
 * Pure keyboard and selection event handlers.
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

import type { EditorStateComplete, HandlerResult } from './EditorTypes';
import type { Node, NodeID, Segment } from './engine';
import {
  getCursorOffsetInPlainText,
  findSegmentAtPlainTextOffset,
} from './engine';
import { getNodePositionFromSelection } from './domMapping';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Keyboard Handling
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
        segments: [], // Will be filled by coordinator from DOM
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
        nodeId: state.cursor.nodeId,
        shiftKey: event.shiftKey,
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
 * Two separate behaviors:
 * 1. Property trigger (: + space) - works anywhere, conditional text removal
 * 2. Markdown triggers ([], -, #) - only in empty nodes, always remove text
 * 
 * CRITICAL: Must extract segments BEFORE calling this handler.
 * This handler is DOM-first - it reads extracted segments, not live DOM.
 * 
 * @param state - Current editor state
 * @param event - Keyboard event
 * @param segments - Segments extracted from DOM (REQUIRED)
 * @param isComposing - Whether IME composition is active
 * @returns Handler result with action or null
 */
export function handleSpace(
  state: EditorStateComplete,
  _event: React.KeyboardEvent,
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PATH 1: PROPERTY TRIGGER (: + space)
  // Works anywhere in text (empty or with content)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  // Check if text before cursor ends with : (but not ::, etc.)
  if (textBefore.endsWith(':') && !textBefore.endsWith('::')) {
    // Property trigger detected
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PATH 2: MARKDOWN TRIGGERS ([], -, #)
  // Only work in EMPTY nodes (node variant transformation)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

  // No triggers detected - let browser handle space normally
  return { action: null };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Global Command Handlers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Handle Undo command (Cmd+Z / Ctrl+Z)
 * 
 * @param _state - Current editor state (unused for now)
 * @returns Handler result with UNDO action
 */
export function handleUndo(
  _state: EditorStateComplete
): HandlerResult {
  return {
    action: {
      type: 'UNDO',
      payload: {},
    },
    preventDefault: true,
    stopPropagation: false,
    isStructural: false,
    requestCaret: false,
  };
}

/**
 * Handle Redo command (Cmd+Shift+Z / Ctrl+Shift+Z)
 * 
 * @param _state - Current editor state (unused for now)
 * @returns Handler result with REDO action
 */
export function handleRedo(
  _state: EditorStateComplete
): HandlerResult {
  return {
    action: {
      type: 'REDO',
      payload: {},
    },
    preventDefault: true,
    stopPropagation: false,
    isStructural: false,
    requestCaret: false,
  };
}

/**
 * Handle Zoom In command (Cmd+Enter / Ctrl+Enter)
 * 
 * Zooms into the current node (makes it temporary root).
 * 
 * @param state - Current editor state
 * @returns Handler result with ZOOM_IN action
 */
export function handleZoomIn(
  state: EditorStateComplete
): HandlerResult {
  return {
    action: {
      type: 'ZOOM_IN',
      payload: {
        nodeId: state.cursor.nodeId,
      },
    },
    preventDefault: true,
    stopPropagation: false,
    isStructural: false,
    requestCaret: false,
  };
}

/**
 * Handle Zoom Out command (Escape)
 * 
 * Returns to parent view. Must check if query bar is open first.
 * 
 * @param _state - Current editor state (unused for now)
 * @param isQueryBarOpen - Whether query bar is currently open
 * @returns Handler result with ZOOM_OUT or QUERY_BAR_TOGGLE action
 */
export function handleZoomOut(
  _state: EditorStateComplete,
  isQueryBarOpen: boolean
): HandlerResult {
  // Priority: Close query bar first, then zoom out
  if (isQueryBarOpen) {
    return {
      action: {
        type: 'QUERY_BAR_TOGGLE',
        payload: { isOpen: false },
      },
      preventDefault: true,
      stopPropagation: false,
      isStructural: false,
      requestCaret: false,
    };
  }

  return {
    action: {
      type: 'ZOOM_OUT',
      payload: {},
    },
    preventDefault: true,
    stopPropagation: false,
    isStructural: false,
    requestCaret: false,
  };
}

/**
 * Handle Query Bar toggle (/)
 * 
 * Opens the query/filter bar.
 * 
 * @param _state - Current editor state (unused for now)
 * @returns Handler result with QUERY_BAR_TOGGLE action
 */
export function handleQueryBarOpen(
  _state: EditorStateComplete
): HandlerResult {
  return {
    action: {
      type: 'QUERY_BAR_TOGGLE',
      payload: { isOpen: true },
    },
    preventDefault: true,
    stopPropagation: false,
    isStructural: false,
    requestCaret: false,
  };
}

/**
 * Handle Reference Picker command (Cmd+Shift+R / Ctrl+Shift+R)
 * 
 * Opens reference picker with current node as source.
 * 
 * @param state - Current editor state
 * @returns Handler result with REFERENCE_PICKER_OPEN action
 */
export function handleReferencePickerOpen(
  state: EditorStateComplete
): HandlerResult {
  return {
    action: {
      type: 'REFERENCE_PICKER_OPEN',
      payload: {
        sourceNodeId: state.cursor.nodeId,
      },
    },
    preventDefault: true,
    stopPropagation: false,
    isStructural: false,
    requestCaret: false,
  };
}

/**
 * Handle Save View Dialog command (Cmd+Shift+S / Ctrl+Shift+S)
 * 
 * Opens dialog to save current view (query + focus).
 * 
 * @param _state - Current editor state (unused for now)
 * @returns Handler result with SAVE_VIEW_DIALOG_OPEN action
 */
export function handleSaveViewDialogOpen(
  _state: EditorStateComplete
): HandlerResult {
  return {
    action: {
      type: 'SAVE_VIEW_DIALOG_OPEN',
      payload: {},
    },
    preventDefault: true,
    stopPropagation: false,
    isStructural: false,
    requestCaret: false,
  };
}

/**
 * Handle Template Picker command (Cmd+Shift+T / Ctrl+Shift+T)
 * 
 * Opens template picker dialog.
 * 
 * @param _state - Current editor state (unused for now)
 * @returns Handler result with TEMPLATE_PICKER_OPEN action
 */
export function handleTemplatePickerOpen(
  _state: EditorStateComplete
): HandlerResult {
  return {
    action: {
      type: 'TEMPLATE_PICKER_OPEN',
      payload: {},
    },
    preventDefault: true,
    stopPropagation: false,
    isStructural: false,
    requestCaret: false,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Selection Handling
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
