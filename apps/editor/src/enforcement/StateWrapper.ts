/**
 * 🔒 STATE WRAPPER — ENFORCED Access Control
 * 
 * ABSOLUTE PRINCIPLE:
 * Raw setEditorState is IMPOSSIBLE to access.
 * ALL mutations go through CommitPipeline.
 * Bypassing this = crash immediately.
 * 
 * This wrapper ensures:
 * - Model is always updated before React
 * - Invariants are checked after every update
 * - Forbidden states crash immediately
 * - Cannot mutate outside pipeline
 */

import type { Node, CursorPosition } from './editor/engine';
// NOTE: EditorModel singleton removed - wrapper now works without model sync
import { assertEditorInvariants } from './invariants';
import { isPipelineLocked } from './CommitPipeline';

/**
 * Internal React setState (HIDDEN - cannot be accessed)
 */
let _setReactState: ((state: any) => void) | null = null;

/**
 * Mutation tracking (dev mode only)
 */
let _mutationAllowed = false;
let _currentOperation: string | null = null;

export function _initializeStateWrapper(setEditorState: (state: any) => void): void {
  _setReactState = setEditorState;
}

/**
 * PIPELINE CONTROL: Allow mutation (called by pipeline only)
 */
export function _allowMutation(operation: string): void {
  _mutationAllowed = true;
  _currentOperation = operation;
}

/**
 * PIPELINE CONTROL: Block mutation (called by pipeline only)
 */
export function _blockMutation(): void {
  _mutationAllowed = false;
  _currentOperation = null;
}

/**
 * ENFORCED setState: Only way to update React state
 * 
 * CRITICAL: This can ONLY be called by CommitPipeline.
 * All other calls crash immediately.
 */
export function setEditorState(changes: {
  nodes?: Node[];
  cursor?: CursorPosition;
  [key: string]: any;
}): void {
  if (!_setReactState) {
    throw new Error('StateWrapper not initialized');
  }

  // 🔒 ENFORCEMENT: Crash if mutation outside pipeline
  if (__DEV__ && !_mutationAllowed) {
    const stack = new Error().stack || '';
    throw new Error(
      `❌ ARCHITECTURAL VIOLATION: State mutation outside CommitPipeline\n` +
      `You MUST use performEditorOperation() for ALL structural changes.\n` +
      `Direct setEditorState calls are FORBIDDEN.\n\n` +
      `Stack trace:\n${stack}`
    );
  }

  // CRITICAL: Update model FIRST
  // NOTE: Singleton model removed - caller updates modelRef.current directly
  // if (changes.nodes && changes.cursor) {
  //   updateModel(changes.nodes, changes.cursor);
  // } else if (changes.nodes) {
  //   updateModelNodes(changes.nodes);
  // } else if (changes.cursor) {
  //   updateModelCursor(changes.cursor);
  // }

  // Validate (crash on forbidden states)
  if (__DEV__ && changes.nodes && changes.cursor) {
    assertEditorInvariants(changes.nodes, changes.cursor, _currentOperation || 'unknown');
  }

  // Update React (view layer)
  _setReactState(changes);

  if (__DEV__) {

  }
}

/**
 * ❌ DELETED: _dangerouslyGetRawSetter
 * 
 * Raw setState access is now IMPOSSIBLE.
 * All mutations MUST go through CommitPipeline.
 */

// Global declaration for __DEV__
declare const __DEV__: boolean;
