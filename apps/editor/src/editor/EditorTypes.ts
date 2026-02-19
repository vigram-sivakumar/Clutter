/**
 * EditorTypes.ts
 * 
 * Central type definitions for the editor architecture.
 * 
 * This file defines:
 * - Editor state shape
 * - All action types (for reducer)
 * - Handler result types (for pure functions)
 * - Coordinator context
 * 
 * ARCHITECTURAL PRINCIPLE:
 * Handlers return intent (actions), not mutations.
 * Reducer computes new state from actions.
 * Coordinator orchestrates side effects.
 */

import type { Node, NodeID, Segment, CursorPosition } from './engine';
import type { DOMObserver } from './observer';

/**
 * Ephemeral caret placement intent
 * Lives in NodeEditor component state, NOT in reducer state
 * Auto-clears after one render cycle
 */
export interface CaretIntent {
  nodeId: NodeID;
  token: string; // Unique token prevents stale placements
}

/**
 * Selection range (for multi-node selections)
 */
export interface SelectionRange {
  anchor: {
    nodeId: NodeID;
    offset: number;
  } | null;
  focus: {
    nodeId: NodeID;
    offset: number;
  } | null;
}

/**
 * Grammar session state (for slash commands, @ mentions, etc.)
 */
export interface GrammarSessionState {
  isActive: boolean;
  grammar?: {
    type: 'slash' | 'reference' | 'hashtag';
    trigger: string;
  };
  candidates: Array<{
    commandType: string;
    params: Record<string, unknown>;
  }>;
  selectedIndex: number;
  range?: {
    from: number;
    to: number;
  };
}

/**
 * Complete editor state
 * 
 * This is the single source of truth for all editor data.
 */
export interface EditorStateComplete {
  /**
   * All nodes in the editor
   */
  nodes: Node[];

  /**
   * Current cursor position
   */
  cursor: CursorPosition;

  /**
   * Current selection range (if multi-node selection)
   */
  selection: SelectionRange;

  /**
   * Focus root (for zoomed view)
   */
  focusRootId: NodeID | null;

  /**
   * Grammar session state
   */
  grammarSession: GrammarSessionState;

  /**
   * Composition state (IME input)
   */
  isComposing: boolean;
}

/**
 * Editor action types
 * 
 * All state mutations go through these actions.
 * Handlers return actions, reducer processes them.
 */
export type EditorAction =
  // Keyboard actions (structural)
  | {
      type: 'ENTER_PRESSED';
      payload: {
        cursor: CursorPosition;
        segments: Segment[]; // Fresh segments from DOM
        nodes: Node[]; // Current nodes for split computation
      };
    }
  | {
      type: 'BACKSPACE_PRESSED';
      payload: {
        cursor: CursorPosition;
        segments: Segment[]; // Current node segments from DOM
        nodes: Node[]; // Current nodes for merge computation
      };
    }
  | {
      type: 'ARROW_PRESSED';
      payload: {
        direction: 'up' | 'down' | 'left' | 'right';
        cursor: CursorPosition;
        nodes: Node[]; // For navigation computation
      };
    }
  | {
      type: 'TAB_PRESSED';
      payload: {
        nodeId: NodeID;
        shiftKey: boolean;
      };
    }
  | {
      type: 'MARKDOWN_TRIGGER';
      payload: {
        trigger: string;
        newVariant: string;
        nodeId: NodeID;
        clearedSegments: Segment[];
      };
    }
  | {
      type: 'PROPERTY_EDITOR_OPEN';
      payload: {
        nodeId: NodeID;
      };
    }

  // Selection actions (non-structural)
  | {
      type: 'SELECTION_CHANGED';
      payload: {
        cursor: CursorPosition;
      };
    }
  | {
      type: 'SELECTION_RANGE_CHANGED';
      payload: {
        selection: SelectionRange;
        cursor: CursorPosition;
      };
    }

  // Commit actions (non-structural, DOM sync)
  | {
      type: 'BLUR_COMMIT';
      payload: {
        nodeId: NodeID;
        segments: Segment[];
        cursor?: CursorPosition;
      };
    }
  | {
      type: 'SEGMENTS_UPDATED';
      payload: {
        nodeId: NodeID;
        segments: Segment[];
      };
    }

  // Composition actions
  | {
      type: 'COMPOSITION_START';
      payload: {
        nodeId: NodeID;
      };
    }
  | {
      type: 'COMPOSITION_END';
      payload: {
        nodeId: NodeID;
      };
    }

  // Focus actions
  | {
      type: 'ZOOM_IN';
      payload: {
        nodeId: NodeID;
      };
    }
  | {
      type: 'ZOOM_OUT';
      payload: {};
    }

  // Grammar actions
  | {
      type: 'GRAMMAR_SESSION_START';
      payload: {
        session: GrammarSessionState;
      };
    }
  | {
      type: 'GRAMMAR_SESSION_UPDATE';
      payload: {
        session: GrammarSessionState;
      };
    }
  | {
      type: 'GRAMMAR_SESSION_CANCEL';
      payload: {};
    }

  // Markdown trigger actions (Batch 4)
  | {
      type: 'MARKDOWN_TRIGGER';
      payload: {
        trigger: '[]' | '-' | '#';
        newVariant: string;
        nodeId: NodeID;
        clearedSegments: Segment[]; // Segments after removing trigger text
      };
    }
  | {
      type: 'PROPERTY_EDITOR_OPEN';
      payload: {
        nodeId: NodeID;
      };
    }

  // Global command actions (Batch 5)
  | {
      type: 'UNDO';
      payload: {};
    }
  | {
      type: 'REDO';
      payload: {};
    }
  | {
      type: 'QUERY_BAR_TOGGLE';
      payload: {
        isOpen: boolean;
      };
    }
  | {
      type: 'REFERENCE_PICKER_OPEN';
      payload: {
        sourceNodeId: NodeID;
      };
    }
  | {
      type: 'SAVE_VIEW_DIALOG_OPEN';
      payload: {};
    }
  | {
      type: 'TEMPLATE_PICKER_OPEN';
      payload: {};
    };

/**
 * Handler result
 * 
 * Pure functions return this to indicate what should happen.
 * They do NOT mutate state directly.
 */
export interface HandlerResult {
  /**
   * Action to dispatch (null means "do nothing")
   */
  action: EditorAction | null;

  /**
   * Whether to prevent default browser behavior
   */
  preventDefault?: boolean;

  /**
   * Whether to stop event propagation
   */
  stopPropagation?: boolean;

  /**
   * Whether this is a structural operation (needs observer stop + caret placement)
   */
  isStructural?: boolean;

  /**
   * Whether to request caret placement after action
   */
  requestCaret?: boolean;
}

/**
 * Coordinator context
 * 
 * All the refs and infrastructure needed for operation coordination.
 */
export interface CoordinatorContext {
  /**
   * Map of node ID to DOMObserver
   */
  domObservers: React.MutableRefObject<Map<NodeID, DOMObserver>>;

  /**
   * Structural lock (prevents selection changes during commits)
   */
  structuralLockRef: React.MutableRefObject<boolean>;
}

/**
 * Coordinator interface
 * 
 * Single entry point for all editor operations.
 */
export interface EditorCoordinator {
  /**
   * Execute an action with full orchestration
   * 
   * @param action - The action to execute
   */
  execute(action: EditorAction): void;
}
