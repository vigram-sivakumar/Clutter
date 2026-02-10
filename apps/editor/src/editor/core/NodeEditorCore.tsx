/**
 * NodeEditorCore.tsx
 * 
 * NEW ARCHITECTURE: Demonstrates the refactored editor core.
 * 
 * This file shows how NodeEditor.tsx should be structured after
 * the complete refactor. It serves as a blueprint for migration.
 * 
 * KEY PRINCIPLES:
 * - No inline logic
 * - Pure functions for all handlers
 * - Single coordinator for all operations
 * - Reducer for all state changes
 * - Clear separation of concerns
 */

import { useRef, useMemo, useEffect } from 'react';
import type { Node, NodeID } from '../../engine/NodeKernel';
import type { CursorPosition } from '../../engine/EditorState';
import type { EditorStateComplete } from './EditorTypes';
import { useEditorStateReducer } from './EditorStateReducer';
import { createEditorCoordinator } from './EditorCoordinator';
import { handleKeyboardEvent } from '../handlers/KeyboardHandlers';
import { handleSelectionChange, handleCompositionStart, handleCompositionEnd } from '../handlers/SelectionHandlers';
import { useObserverLifecycle } from '../observers/ObserverLifecycle';
import { useCaretPlacement } from '../caret/CaretPlacement';
import { EditorModelIndex } from '../EditorModel.index';
import type { DOMObserver } from '../DOMObserver';

/**
 * Core editor component (NEW ARCHITECTURE)
 * 
 * This is what NodeEditor.tsx should become after refactor.
 * 
 * STRUCTURE:
 * 1. State (single reducer)
 * 2. Refs (infrastructure only)
 * 3. Coordinator (single instance)
 * 4. Hooks (effects, side effects)
 * 5. Event handlers (pure function calls + coordinator)
 * 6. Render (no logic)
 */
export function NodeEditorCore() {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. STATE (Single Reducer)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const [editorState, dispatch] = useEditorStateReducer(getInitialState());

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. REFS (Infrastructure Only)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // DOM observers map
  const domObservers = useRef<Map<NodeID, DOMObserver>>(new Map());

  // Index-based model (for backward compatibility)
  const modelRef = useRef<EditorModelIndex | null>(null);

  // Caret placement flag
  const needsCaretPlacementRef = useRef(false);

  // Structural lock (prevents selection during commits)
  const structuralLockRef = useRef(false);

  // Container ref (for selection detection)
  const containerRef = useRef<HTMLDivElement>(null);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. COORDINATOR (Single Instance)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const coordinator = useMemo(
    () =>
      createEditorCoordinator(dispatch, {
        domObservers,
        modelRef,
        needsCaretPlacementRef,
        structuralLockRef,
      }),
    [dispatch]
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4. HOOKS (Effects, Side Effects)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Observer lifecycle (Priority 2)
  useObserverLifecycle({
    nodeIds: editorState.nodes.map((n) => n.id),
    onMutationsBatched: (nodeId, mutations) => {
      console.log('[DOMObserver] Mutations batched', { nodeId, count: mutations.length });
    },
    debug: true,
  });

  // Caret placement (Priority 3)
  useCaretPlacement({
    editorState,
    needsPlacementRef: needsCaretPlacementRef,
  });

  // Sync model with state (for backward compatibility)
  useEffect(() => {
    if (modelRef.current) {
      // Update model when state changes
      // TODO: Remove this once fully migrated to reducer
    }
  }, [editorState]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 5. EVENT HANDLERS (Pure Function Calls + Coordinator)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Keyboard event handler
   * 
   * FLOW:
   * 1. Call pure handler function
   * 2. Apply preventDefault/stopPropagation if needed
   * 3. Pass action to coordinator
   * 4. Coordinator handles orchestration
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Call pure handler
    const result = handleKeyboardEvent(
      editorState,
      e,
      editorState.isComposing
    );

    // Apply event flags
    if (result.preventDefault) e.preventDefault();
    if (result.stopPropagation) e.stopPropagation();

    // Dispatch action through coordinator
    if (result.action) {
      coordinator.execute(result.action);
    }
  };

  /**
   * Selection change handler
   * 
   * FLOW:
   * 1. Call pure handler function
   * 2. Pass action to coordinator
   */
  const handleSelectionChangeEvent = () => {
    if (!containerRef.current) return;

    // Call pure handler
    const result = handleSelectionChange(
      editorState,
      containerRef.current,
      structuralLockRef.current
    );

    // Dispatch action through coordinator
    if (result.action) {
      coordinator.execute(result.action);
    }
  };

  /**
   * Composition start handler
   */
  const handleCompositionStartEvent = (nodeId: NodeID) => {
    const result = handleCompositionStart(editorState, nodeId);
    if (result.action) {
      coordinator.execute(result.action);
    }
  };

  /**
   * Composition end handler
   */
  const handleCompositionEndEvent = (nodeId: NodeID) => {
    const result = handleCompositionEnd(editorState, nodeId);
    if (result.action) {
      coordinator.execute(result.action);
    }
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 6. RENDER (No Logic)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  return (
    <div
      ref={containerRef}
      className="editor-container"
      onKeyDown={handleKeyDown}
    >
      {editorState.nodes.map((node) => (
        <div
          key={node.id}
          data-node-id={node.id}
          className="node"
          style={{ paddingLeft: `${(node.indent || 0) * 24}px` }}
        >
          <div
            className="node__content"
            contentEditable
            suppressContentEditableWarning
            onCompositionStart={() => handleCompositionStartEvent(node.id)}
            onCompositionEnd={() => handleCompositionEndEvent(node.id)}
          >
            {/* Render segments */}
            {node.segments.map((segment, idx) => {
              if (segment.type === 'text') {
                return segment.text;
              } else if (segment.type === 'inline') {
                return (
                  <span key={idx} className="inline-element">
                    {segment.kind}
                  </span>
                );
              }
              return null;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Get initial editor state
 * 
 * Helper to construct initial state for demo.
 */
function getInitialState(): EditorStateComplete {
  return {
    nodes: [
      {
        id: '1' as NodeID,
        indent: 0,
        segments: [{ type: 'text', text: 'First node' }],
      },
      {
        id: '2' as NodeID,
        indent: 0,
        segments: [{ type: 'text', text: 'Second node' }],
      },
    ] as Node[],
    cursor: {
      nodeId: '1' as NodeID,
      segmentIndex: 0,
      offset: 0,
    },
    selection: {
      anchor: null,
      focus: null,
    },
    focusRootId: null,
    grammarSession: {
      isActive: false,
      candidates: [],
      selectedIndex: 0,
    },
    isComposing: false,
  };
}
