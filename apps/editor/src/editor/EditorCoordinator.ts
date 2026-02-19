/**
 * EditorCoordinator.ts
 * 
 * Central orchestration layer for ALL state mutations.
 * 
 * CRITICAL: This is the ONLY place where state transitions are executed.
 * 
 * Responsibilities:
 * - Stop/restart observers
 * - Call reducer to compute next state
 * - Validate invariants
 * - Apply state via commit
 * - Request caret placement
 * - Log/instrument transitions
 * 
 * The coordinator controls the lifecycle.
 * The reducer computes the state.
 * They are separated for testability and clarity.
 * 
 * This is the single choke point that enforces correctness.
 */

import type { EditorStateComplete, EditorAction, CoordinatorContext } from './EditorTypes';
import type { CursorPosition, Node } from './engine';
import { editorReducer, validateEditorState } from './reducer';

/**
 * Dependencies needed by coordinator to execute actions
 */
export interface CoordinatorDependencies {
  /**
   * Context with observer refs and structural lock
   */
  context: CoordinatorContext;

  /**
   * Function to apply state changes
   * This is the bridge to React's setState
   */
  commit: (changes: {
    nodes?: Node[];
    cursor?: CursorPosition;
  }) => void;
}

/**
 * Execute an editor action
 * 
 * SINGLE ENTRY POINT for all state mutations.
 * 
 * Lifecycle:
 * 1. Determine if action is structural
 * 2. Stop observers (if structural)
 * 3. Call reducer to compute next state
 * 4. Validate invariants
 * 5. Update index-based model (modelRef)
 * 6. Clear pending mutations
 * 7. Apply state via commit (React state)
 * 8. Request caret placement (if needed)
 * 
 * Note: Observers restart automatically via useObserverLifecycle when nodes change
 * 
 * @param currentState - Current editor state
 * @param action - Action to execute
 * @param deps - Dependencies (observers, commit, caret)
 * @returns Committed cursor position (for caret intent generation)
 */
export function executeAction(
  currentState: EditorStateComplete,
  action: EditorAction,
  deps: CoordinatorDependencies
): CursorPosition {
  const { context, commit } = deps;

  // 1. Determine if action is structural
  const isStructural = isStructuralAction(action);

  // 2. Stop observers if structural operation
  if (isStructural) {
    stopAllObservers(context);
  }

  try {
    // 3. Compute next state (pure)
    const nextState = editorReducer(currentState, action);

    // 4. Validate invariants
    validateEditorState(nextState);

    // React state is single source of truth - no model sync needed

    // 6. Clear pending mutations (prevents stale observer events)
    if (isStructural) {
      const cursorNodeObserver = context.domObservers.current.get(currentState.cursor.nodeId);
      if (cursorNodeObserver) {
        cursorNodeObserver.clearPendingMutations();
      }
    }

    // 7. Apply state via commit (React state update)
    // PHASE 2A: commit() expects nodes and cursor separately
    // In future, we could make commit() accept full EditorStateComplete
    commit({
      nodes: nextState.nodes,
      cursor: nextState.cursor,
    });

    // 8. Request caret placement if action requests it
    // 🚧 PHASE 2 STEP 3: RAF system DISABLED (NodeView layout effect now owns placement)
    // if (shouldRequestCaret(action)) {
    //   requestCaretPlacement();
    // }

    // Return committed cursor for caret intent generation
    return nextState.cursor;
    
  } catch (error) {
    // Invariant violation or reducer error
    // CRITICAL: Do not apply invalid state
    // Rethrow to prevent partial state corruption
    throw error;
  } finally {
    // 9. Observers restart automatically via React lifecycle
    // useObserverLifecycle hook creates new observers when nodes change
    // No manual restart needed
  }
}

/**
 * Determine if action requires observer stop/start
 * 
 * Structural actions modify the DOM structure:
 * - Node creation/deletion
 * - Node splitting/merging
 * - Node reordering
 * 
 * Non-structural actions only update metadata:
 * - Cursor movement
 * - Selection changes
 * 
 * @param action - Action to check
 * @returns true if action is structural
 */
function isStructuralAction(action: EditorAction): boolean {
  switch (action.type) {
    case 'ENTER_PRESSED':
    case 'BACKSPACE_PRESSED':
    case 'TAB_PRESSED':
    case 'MARKDOWN_TRIGGER':
      return true;

    case 'ARROW_PRESSED':
    case 'SELECTION_CHANGED':
    case 'COMPOSITION_START':
    case 'COMPOSITION_END':
    case 'PROPERTY_EDITOR_OPEN':
      return false;

    default:
      // Conservative: treat unknown actions as structural
      return true;
  }
}

/**
 * Determine if action should trigger caret placement
 * 
 * @param action - Action to check
 * @returns true if caret placement needed
 */
export function shouldRequestCaret(action: EditorAction): boolean {
  switch (action.type) {
    case 'ENTER_PRESSED':
    case 'BACKSPACE_PRESSED':
    case 'TAB_PRESSED':
    case 'ARROW_PRESSED':
    case 'MARKDOWN_TRIGGER':
      return true;

    case 'SELECTION_CHANGED':
    case 'COMPOSITION_START':
    case 'COMPOSITION_END':
      return false;

    default:
      // Conservative: request caret for unknown actions
      return true;
  }
}

/**
 * Stop all DOM observers
 * 
 * Called before structural mutations to prevent race conditions.
 * Observers restart automatically via useObserverLifecycle when nodes change.
 * 
 * @param context - Coordinator context with observer map
 */
function stopAllObservers(context: CoordinatorContext): void {
  for (const [_nodeId, observer] of context.domObservers.current.entries()) {
    observer.stop();
  }
}
