/**
 * EditorCoordinator.ts
 * 
 * Central operation orchestrator.
 * 
 * CRITICAL PRINCIPLES:
 * - Single entry point for all editor operations
 * - Consistent sequencing (stop → extract → dispatch → caret)
 * - No manual orchestration in handlers
 * - Timing and side effects isolated here
 * 
 * OPERATION FLOW:
 * 1. Stop observers
 * 2. Extract fresh segments from DOM
 * 3. Dispatch action to reducer
 * 4. Request caret placement (if needed)
 * 5. Release structural lock
 */

import type { Node, NodeID } from '../../engine/NodeKernel';
import type {
  EditorAction,
  CoordinatorContext,
  EditorCoordinator,
} from './EditorTypes';
import { scheduleRAF } from '../caret/CaretUtilities';
import { extractSegmentsFromDOM } from '../DOMObserver';

/**
 * Create editor coordinator
 * 
 * Factory function that creates the coordinator with access to
 * dispatch and refs.
 * 
 * @param dispatch - Reducer dispatch function
 * @param context - Coordinator context (refs, observers, etc.)
 * @returns EditorCoordinator instance
 */
export function createEditorCoordinator(
  dispatch: React.Dispatch<EditorAction>,
  context: CoordinatorContext
): EditorCoordinator {
  const {
    domObservers,
    modelRef,
    needsCaretPlacementRef,
    structuralLockRef,
  } = context;

  /**
   * Execute an action with full orchestration
   * 
   * This is the ONLY entry point for editor operations.
   * 
   * @param action - Action to execute
   */
  function execute(action: EditorAction): void {
    // Determine if structural
    const isStructural = isStructuralAction(action);

    if (isStructural) {
      executeStructural(action);
    } else {
      executeNonStructural(action);
    }
  }

  /**
   * Execute structural operation (node count changes)
   * 
   * FLOW:
   * 1. Lock
   * 2. Stop observers
   * 3. Extract from DOM
   * 4. Dispatch (reducer computes new state)
   * 5. Request caret placement
   * 6. Release lock (after RAF)
   * 
   * @param action - Structural action
   */
  function executeStructural(action: EditorAction): void {
    // Step 1: Lock
    structuralLockRef.current = true;

    try {
      // Step 2: Stop observers
      stopRelevantObservers(action);

      // Step 3: Extract from DOM (enrich action with fresh segments)
      const enrichedAction = extractFromDOM(action);

      // Step 4: Dispatch to reducer
      dispatch(enrichedAction);

      // Step 5: Request caret placement
      if (shouldRequestCaret(action)) {
        needsCaretPlacementRef.current = true;
      }
    } finally {
      // Step 6: Release lock (after RAF, to allow DOM to settle)
      scheduleRAF(() => {
        structuralLockRef.current = false;
      });
    }
  }

  /**
   * Execute non-structural operation
   * 
   * FLOW:
   * 1. Dispatch directly
   * 
   * @param action - Non-structural action
   */
  function executeNonStructural(action: EditorAction): void {
    dispatch(action);
  }

  /**
   * Stop relevant observers based on action
   * 
   * @param action - Action being executed
   */
  function stopRelevantObservers(action: EditorAction): void {
    switch (action.type) {
      case 'ENTER_PRESSED': {
        const observer = domObservers.current.get(action.payload.cursor.nodeId);
        if (observer) {
          observer.stop();
        }
        break;
      }

      case 'BACKSPACE_PRESSED': {
        const observer = domObservers.current.get(action.payload.cursor.nodeId);
        if (observer) {
          observer.stop();
        }
        break;
      }

      case 'TAB_PRESSED': {
        const observer = domObservers.current.get(action.payload.cursor.nodeId);
        if (observer) {
          observer.stop();
        }
        break;
      }

      default:
        // No observers to stop
        break;
    }
  }

  /**
   * Extract fresh segments from DOM
   * 
   * Enriches action with current DOM state before dispatch.
   * 
   * @param action - Action to enrich
   * @returns Enriched action with DOM data
   */
  function extractFromDOM(action: EditorAction): EditorAction {
    switch (action.type) {
      case 'ENTER_PRESSED': {
        // Extract segments from active node
        const nodeId = action.payload.cursor.nodeId;
        const element = getNodeElement(nodeId);
        if (!element) return action;

        const segments = extractSegmentsFromDOM(element);

        return {
          ...action,
          payload: {
            ...action.payload,
            segments,
          },
        };
      }

      case 'BACKSPACE_PRESSED': {
        // Extract segments from current node (and maybe previous)
        const nodeId = action.payload.cursor.nodeId;
        const currentElement = getNodeElement(nodeId);
        if (!currentElement) return action;

        const currentSegments = extractSegmentsFromDOM(currentElement);

        // Check if might merge with previous
        const nodes = action.payload.nodes;
        const currentIndex = nodes.findIndex((n) => n.id === nodeId);
        
        let prevSegments: Node['segments'] | undefined;
        if (currentIndex > 0) {
          const prevNode = nodes[currentIndex - 1];
          if (prevNode) {
            const prevElement = getNodeElement(prevNode.id);
            if (prevElement) {
              prevSegments = extractSegmentsFromDOM(prevElement);
            }
          }
        }

        return {
          ...action,
          payload: {
            ...action.payload,
            currentSegments,
            prevSegments,
          },
        };
      }

      default:
        return action;
    }
  }

  /**
   * Get DOM element for node
   * 
   * @param nodeId - Node ID
   * @returns Node element or null
   */
  function getNodeElement(nodeId: NodeID): HTMLElement | null {
    return document.querySelector(
      `[data-node-id="${nodeId}"] .node__content`
    );
  }

  /**
   * Check if action is structural (changes node count)
   * 
   * @param action - Action to check
   * @returns True if structural
   */
  function isStructuralAction(action: EditorAction): boolean {
    return [
      'ENTER_PRESSED',
      'BACKSPACE_PRESSED',
      'TAB_PRESSED',
    ].includes(action.type);
  }

  /**
   * Check if action should request caret placement
   * 
   * @param action - Action to check
   * @returns True if should request caret
   */
  function shouldRequestCaret(action: EditorAction): boolean {
    return [
      'ENTER_PRESSED',
      'BACKSPACE_PRESSED',
      'ARROW_PRESSED',
    ].includes(action.type);
  }

  return {
    execute,
  };
}
