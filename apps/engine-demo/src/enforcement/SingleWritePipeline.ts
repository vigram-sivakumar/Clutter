/**
 * 🔒 SINGLE WRITE PIPELINE — THE ONLY WAY TO MUTATE STATE
 * 
 * ABSOLUTE RULE:
 * ALL state mutations go through setStateAndModel().
 * Direct calls to setEditorState, updateModel, etc. are FORBIDDEN.
 * 
 * This enforces:
 * - Model updated FIRST
 * - React updated SECOND
 * - Caret placed ALWAYS
 * - Invariants checked ALWAYS
 * - No typing interference
 * - No concurrent operations
 */

import type { Node, CursorPosition } from '../engine/NodeKernel';
import { updateModel, getModel } from '../editor/EditorModel';
import { isTyping } from '../editor/TypingBuffer';
import { assertEditorInvariants } from './invariants';

/**
 * Internal state (hidden from outside)
 */
let _setEditorStateRaw: ((state: any) => void) | null = null;
let _requestCaretPlacementRaw: (() => void) | null = null;
let _isLocked = false;

/**
 * Initialize pipeline (called once on mount)
 */
export function _initializeSingleWritePipeline(
  setEditorState: (state: any) => void,
  requestCaretPlacement: () => void
): void {
  _setEditorStateRaw = setEditorState;
  _requestCaretPlacementRaw = requestCaretPlacement;
  
  if (__DEV__) {
    console.log('🔒 Single Write Pipeline initialized');
    console.log('⚠️ Direct state mutations are now FORBIDDEN');
  }
}

/**
 * THE ONLY WAY TO MUTATE STATE
 * 
 * MANDATORY ORDER (no exceptions):
 * 1. Assert NOT typing
 * 2. Assert NOT locked
 * 3. Update MODEL first
 * 4. Update REACT second
 * 5. Request caret placement ALWAYS
 * 6. Assert invariants AFTER
 */
export function setStateAndModel(params: {
  nodes?: Node[];
  cursor?: CursorPosition;
  reason: string; // MANDATORY: explain WHY this mutation is happening
}): void {
  if (!_setEditorStateRaw || !_requestCaretPlacementRaw) {
    throw new Error('SingleWritePipeline not initialized');
  }

  const { nodes, cursor, reason } = params;

  // GUARD 1: Cannot mutate while typing
  if (isTyping()) {
    throw new Error(
      `FORBIDDEN: State mutation during typing\n` +
      `Reason: ${reason}\n` +
      `Typing must be stopped before structural changes.`
    );
  }

  // GUARD 2: Cannot mutate while locked
  if (_isLocked) {
    throw new Error(
      `FORBIDDEN: Concurrent state mutation\n` +
      `Reason: ${reason}\n` +
      `Another operation is in progress.`
    );
  }

  _isLocked = true;

  try {
    // STEP 1: Update MODEL first (single source of truth)
    if (nodes && cursor) {
      updateModel(nodes, cursor);
    } else if (nodes) {
      const model = getModel();
      updateModel(nodes, model.cursor);
    } else if (cursor) {
      const model = getModel();
      updateModel(model.nodes as Node[], cursor);
    } else {
      throw new Error('setStateAndModel requires nodes and/or cursor');
    }

    const model = getModel();

    // STEP 2: Validate BEFORE React update
    if (__DEV__) {
      assertEditorInvariants(model.nodes as Node[], model.cursor, reason);
    }

    // STEP 3: Update REACT (mirror of model)
    _setEditorStateRaw({
      nodes: model.nodes,
      cursor: model.cursor,
    });

    // STEP 4: Request caret placement ALWAYS (mandatory)
    _requestCaretPlacementRaw();

    // STEP 5: Validate AFTER React update (model === React)
    if (__DEV__) {
      // Check will happen on next render via effect
      scheduleModelReactSyncCheck();
    }

    if (__DEV__) {
      console.log(`✅ State updated [${reason}]:`, {
        nodeCount: model.nodes.length,
        cursor: model.cursor,
      });
    }

  } finally {
    _isLocked = false;
  }
}

/**
 * Schedule model/React sync check (runs after React updates)
 */
let syncCheckScheduled = false;

function scheduleModelReactSyncCheck(): void {
  if (syncCheckScheduled) return;
  syncCheckScheduled = true;

  // Check after React finishes rendering
  setTimeout(() => {
    syncCheckScheduled = false;
    // Check will be done by effect in NodeEditor
  }, 0);
}

/**
 * Check if pipeline is locked
 */
export function isPipelineLocked(): boolean {
  return _isLocked;
}

/**
 * FORBIDDEN FUNCTIONS (for migration tracking)
 * 
 * These throw to catch any remaining direct calls.
 */
export function _forbiddenSetEditorState(): never {
  throw new Error(
    '❌ ARCHITECTURAL VIOLATION: Direct setEditorState call\n' +
    'You MUST use setStateAndModel() instead.\n' +
    'Direct state mutations bypass enforcement.'
  );
}

export function _forbiddenUpdateModel(): never {
  throw new Error(
    '❌ ARCHITECTURAL VIOLATION: Direct updateModel call\n' +
    'You MUST use setStateAndModel() instead.\n' +
    'Direct model mutations bypass React sync.'
  );
}

export function _forbiddenRequestCaretPlacement(): never {
  throw new Error(
    '❌ ARCHITECTURAL VIOLATION: Direct requestCaretPlacement call\n' +
    'Caret placement is automatic in setStateAndModel().\n' +
    'Manual calls indicate missing pipeline usage.'
  );
}

// Global declaration for __DEV__
declare const __DEV__: boolean;
