/**
 * EditorReducer.ts
 * 
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

import type { Node, Segment } from '../../engine/NodeKernel';
import type { EditorStateComplete, EditorAction } from './EditorTypes';
import { handleSegmentedEnter, handleSegmentedBackspace } from '../index';

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
 * PHASE 2B-F: All keyboard and selection handlers
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
    case 'ENTER_PRESSED':
      return handleEnterPressed(state, action);
    
    case 'BACKSPACE_PRESSED':
      return handleBackspacePressed(state, action);
    
    case 'TAB_PRESSED':
      return handleTabPressed(state, action);
    
    case 'ARROW_PRESSED':
      return handleArrowPressed(state, action);
    
    case 'MARKDOWN_TRIGGER':
      return handleMarkdownTrigger(state, action);
    
    case 'PROPERTY_EDITOR_OPEN':
      return handlePropertyEditorOpen(state, action);
    
    case 'SELECTION_CHANGED':
      return handleSelectionChanged(state, action);
    
    case 'COMPOSITION_START':
    case 'COMPOSITION_END':
      return handleComposition(state, action);

    default:
      // Unknown action - return state unchanged
      return state;
  }
}

/**
 * Handle ENTER_PRESSED action
 * 
 * Computes node split:
 * - Splits current node at cursor into head/tail
 * - Creates new node for tail segments
 * - Inserts new node after current
 * - Moves cursor to new node
 * 
 * Uses the battle-tested handleSegmentedEnter logic.
 * 
 * @param state - Current state
 * @param action - ENTER_PRESSED action with segments + cursor
 * @returns New state with split applied
 */
function handleEnterPressed(
  state: EditorStateComplete,
  action: Extract<EditorAction, { type: 'ENTER_PRESSED' }>
): EditorStateComplete {
  const { cursor, segments, nodes } = action.payload;

  // Find current node
  const currentNode = nodes.find((n) => n.id === cursor.nodeId);
  if (!currentNode) {
    // Guard: cursor points to non-existent node
    // This should never happen if handlers are correct
    return state;
  }

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
  const currentIndex = nodes.findIndex((n) => n.id === cursor.nodeId);
  const updatedNodes = [
    ...nodes.slice(0, currentIndex),
    normalizedHead,
    normalizedTail,
    ...nodes.slice(currentIndex + 1),
  ];

  // Return new state with cursor at start of tail node
  return {
    ...state,
    nodes: updatedNodes,
    cursor: splitResult.cursor,
  };
}

/**
 * Handle BACKSPACE_PRESSED action
 * 
 * Computes node merge or character deletion:
 * - If at start of node: merge with previous
 * - Otherwise: delete character before cursor
 * 
 * @param state - Current state
 * @param action - BACKSPACE_PRESSED action
 * @returns New state with deletion applied
 */
function handleBackspacePressed(
  state: EditorStateComplete,
  action: Extract<EditorAction, { type: 'BACKSPACE_PRESSED' }>
): EditorStateComplete {
  const { cursor, segments, nodes } = action.payload;

  // Find current node
  const currentNode = nodes.find((n) => n.id === cursor.nodeId);
  if (!currentNode) {
    return state;
  }

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
    
    const currentIndex = nodes.findIndex((n) => n.id === cursor.nodeId);
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
    const normalizedNode = normalizeEmptyNode(backspaceResult.updated!);
    
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

/**
 * Handle TAB_PRESSED action
 * 
 * Indent or outdent node:
 * - Tab: increase indent
 * - Shift+Tab: decrease indent
 * 
 * @param state - Current state
 * @param action - TAB_PRESSED action
 * @returns New state with indent applied
 */
function handleTabPressed(
  state: EditorStateComplete,
  action: Extract<EditorAction, { type: 'TAB_PRESSED' }>
): EditorStateComplete {
  const { nodeId, shiftKey } = action.payload;

  const updatedNodes = state.nodes.map((node) => {
    if (node.id !== nodeId) return node;

    const currentIndent = (node as any).indent || 0;
    const newIndent = shiftKey
      ? Math.max(0, currentIndent - 1)
      : currentIndent + 1;

    return { ...node, indent: newIndent } as any;
  });

  return {
    ...state,
    nodes: updatedNodes,
  };
}

/**
 * Handle ARROW_PRESSED action
 * 
 * Move cursor in specified direction
 * 
 * @param state - Current state
 * @param action - ARROW_PRESSED action
 * @returns New state with cursor moved
 */
function handleArrowPressed(
  state: EditorStateComplete,
  action: Extract<EditorAction, { type: 'ARROW_PRESSED' }>
): EditorStateComplete {
  const { cursor } = action.payload;

  return {
    ...state,
    cursor,
  };
}

/**
 * Handle MARKDOWN_TRIGGER action
 * 
 * Change node variant based on trigger pattern:
 * - [] → task
 * - - → bullet
 * - # → heading
 * 
 * @param state - Current state
 * @param action - MARKDOWN_TRIGGER action
 * @returns New state with variant changed
 */
function handleMarkdownTrigger(
  state: EditorStateComplete,
  action: Extract<EditorAction, { type: 'MARKDOWN_TRIGGER' }>
): EditorStateComplete {
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

/**
 * Handle PROPERTY_EDITOR_OPEN action
 * 
 * No state change (UI-only)
 * 
 * @param state - Current state
 * @param action - PROPERTY_EDITOR_OPEN action
 * @returns State unchanged
 */
function handlePropertyEditorOpen(
  state: EditorStateComplete,
  action: Extract<EditorAction, { type: 'PROPERTY_EDITOR_OPEN' }>
): EditorStateComplete {
  // Property editor is UI-only, no state change
  return state;
}

/**
 * Handle SELECTION_CHANGED action
 * 
 * Update cursor position from selection
 * 
 * @param state - Current state
 * @param action - SELECTION_CHANGED action
 * @returns New state with cursor updated
 */
function handleSelectionChanged(
  state: EditorStateComplete,
  action: Extract<EditorAction, { type: 'SELECTION_CHANGED' }>
): EditorStateComplete {
  const { cursor } = action.payload;

  return {
    ...state,
    cursor,
  };
}

/**
 * Handle COMPOSITION_START/END actions
 * 
 * Update composition state
 * 
 * @param state - Current state
 * @param action - COMPOSITION action
 * @returns New state with composition flag updated
 */
function handleComposition(
  state: EditorStateComplete,
  action: Extract<EditorAction, { type: 'COMPOSITION_START' | 'COMPOSITION_END' }>
): EditorStateComplete {
  return {
    ...state,
    isComposing: action.type === 'COMPOSITION_START',
  };
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

  // PHASE 2A: More invariants can be added as we discover them
  // Examples:
  // - Parent-child relationships are valid
  // - No orphaned nodes
  // - Segment integrity
}
