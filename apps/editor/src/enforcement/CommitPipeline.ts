/**
 * 🔒 SINGLE COMMIT PIPELINE — Only Way to Change State
 *
 * CRITICAL PRINCIPLE:
 * ALL structural operations go through this pipeline.
 * Enter, Backspace, Arrow, Click, Zoom, Grammar - NO EXCEPTIONS.
 *
 * The pipeline enforces:
 * 1. Lock → prevents concurrent operations
 * 2. Flush typing → syncs pending changes
 * 3. Update model → single source of truth
 * 4. Validate → crash on forbidden states
 * 5. Render → React renders from model
 * 6. Place caret → automatic, mandatory
 * 7. Unlock → allow next operation
 *
 * If you bypass this pipeline, the system WILL break.
 */

import type { Node, CursorPosition } from '../engine/NodeKernel';
// ✂️ PHASE 2.5: TypingBuffer imports DELETED
// NOTE: EditorModel singleton removed - pipeline now works with explicit state
import { assertEditorInvariants, deepFreeze } from './invariants';
import { _allowMutation, _blockMutation } from './StateWrapper';

/**
 * Pipeline state
 */
let isLocked = false;
let caretPlacementPending = false;

/**
 * Internal React setState reference (set by NodeEditor)
 */
let _setEditorStateInternal: ((state: any) => void) | null = null;
let _requestCaretPlacementInternal: (() => void) | null = null;
let _initialized = false;

export function _initializePipeline(
  setEditorState: (state: any) => void,
  requestCaretPlacement: () => void
): void {
  if (_initialized) {
    throw new Error('Pipeline already initialized');
  }
  _setEditorStateInternal = setEditorState;
  _requestCaretPlacementInternal = requestCaretPlacement;
  _initialized = true;
}

/**
 * Check if pipeline is locked
 */
export function isPipelineLocked(): boolean {
  return isLocked;
}

/**
 * Lock the pipeline (blocks all operations)
 */
function lock(operation: string): void {
  isLocked = true;
  caretPlacementPending = false;
}

/**
 * Unlock the pipeline (synchronous, no rAF)
 */
function unlock(): void {
  isLocked = false;
}

/**
 * ✂️ PHASE 2.5: flushTypingChanges() DELETED
 * With MutationObserver, DOM is extracted at commit boundaries
 * No pending buffer to flush - extractSegmentsFromDOM() is called directly
 */
function flushTypingChanges(currentNodes: Node[]): Node[] {
  // No-op - kept for compatibility
  // Will be fully removed in future cleanup
  return currentNodes;
}

/**
 * Validate invariants
 */
function validate(nodes: Node[], cursor: CursorPosition, label: string): void {
  if (__DEV__) {
    assertEditorInvariants(nodes, cursor, label);
  }
}

/**
 * MASTER FUNCTION: performEditorOperation
 *
 * This is the ONLY way to perform structural operations.
 * All Enter, Backspace, Arrow, Click, Zoom, Grammar ops go through here.
 *
 * ENFORCEMENT: State mutations outside this function CRASH.
 *
 * CRITICAL ARCHITECTURAL RULE:
 * execute() receives NO PARAMETERS.
 * It MUST read from getModel() - the ONLY source of truth.
 * React state is a READ-ONLY MIRROR.
 */
export interface EditorOperation {
  type: string; // e.g., "Enter", "Backspace", "ArrowUp"
  execute: () => {
    nodes: Node[];
    cursor: CursorPosition;
  };
}

export function performEditorOperation(operation: EditorOperation): void {
  if (!_setEditorStateInternal || !_requestCaretPlacementInternal) {
    throw new Error(
      'Pipeline not initialized. Call _initializePipeline first.'
    );
  }

  // 🔒 REENTRANCY GUARD: Reject concurrent operations
  if (isLocked) {
    throw new Error(
      `PIPELINE VIOLATION: Reentrant operation "${operation.type}"\n` +
        `Pipeline is already locked. Cannot start new operation while another is in progress.`
    );
  }

  // 🔒 MODEL GUARD: Singleton model removed
  // NOTE: Operations now use EditorModelIndex via modelRef.current
  // TODO: Remove this function if no longer needed

  // STEP 1: Lock
  lock(operation.type);

  try {
    // ✂️ PHASE 2.5: stopTyping() DELETED
    // Observers are stopped at commit boundaries via stop() calls

    // ✂️ PHASE 2.5: flushTypingChanges() is now no-op
    // NOTE: Model sync removed - operations work with explicit state

    // STEP 4: Execute operation
    // 🔒 CRITICAL: execute() reads from model directly (SINGLE SOURCE OF TRUTH)
    // React state is IGNORED - it is a read-only mirror
    const result = operation.execute();

    // STEP 5: Freeze in dev (immutability check)
    if (__DEV__) {
      deepFreeze(result.nodes);
      deepFreeze(result.cursor);
    }

    // STEP 6: Update model
    // NOTE: Model sync removed - caller updates modelRef directly

    // STEP 7: Validate
    validate(result.nodes, result.cursor, operation.type);

    // STEP 8: Render (update React)
    // 🔒 CRITICAL: Allow mutation for this operation only
    _allowMutation(operation.type);

    try {
      _setEditorStateInternal({
        nodes: result.nodes,
        cursor: result.cursor,
      });
    } finally {
      _blockMutation();
    }

    // STEP 9: Place caret (automatic, mandatory)
    caretPlacementPending = true;
    _requestCaretPlacementInternal();
  } catch (error) {

    _blockMutation(); // Ensure mutation blocked even on error
    throw error; // Re-throw to surface the error
  } finally {
    // STEP 10: Unlock (ALWAYS runs, even on error)
    unlock();
  }
}

/**
 * FORBIDDEN: Direct state updates
 *
 * These functions throw if called outside the pipeline.
 */
export function commitState(changes: {
  nodes?: Node[];
  cursor?: CursorPosition;
}): never {
  throw new Error(
    `PIPELINE VIOLATION: commitState() called directly\n` +
      `You MUST use performEditorOperation() instead.\n` +
      `Direct state updates bypass validation and caret placement.`
  );
}

/**
 * Check if caret placement is pending
 */
export function isCaretPlacementPending(): boolean {
  return caretPlacementPending;
}

/**
 * Mark caret placement as complete
 */
export function markCaretPlaced(): void {
  caretPlacementPending = false;
}

// Global declaration for __DEV__
declare const __DEV__: boolean;
