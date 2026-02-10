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

import type { Node, NodeID, Segment } from '../../engine/NodeKernel';
import type { CursorPosition } from '../../engine/EditorState';
import type { EditorModelIndex, IndexCursor } from '../EditorModel.index';
import type { DOMObserver } from '../DOMObserver';

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
        currentSegments: Segment[]; // Current node segments from DOM
        prevSegments?: Segment[]; // Previous node segments (if merging)
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
        shiftKey: boolean;
        cursor: CursorPosition;
        nodes: Node[];
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
   * Index-based model instance
   */
  modelRef: React.MutableRefObject<EditorModelIndex | null>;

  /**
   * Flag for requesting caret placement
   */
  needsCaretPlacementRef: React.MutableRefObject<boolean>;

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
