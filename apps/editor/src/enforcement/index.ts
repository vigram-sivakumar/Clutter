/**
 * 🔒 ENFORCEMENT LAYER — Public API
 * 
 * This is the ONLY way to interact with editor state.
 * Direct access to React state is FORBIDDEN.
 * 
 * ALL mutations go through performEditorOperation.
 * ALL selections go through captureSelectionIntent.
 * ALL assertions run automatically.
 * 
 * Bypassing this layer = crash.
 */

// Pipeline (ONLY mutation path)
export { 
  performEditorOperation,
  isPipelineLocked,
  _initializePipeline,
  type EditorOperation,
} from './CommitPipeline';

// State wrapper (enforces model sync)
export {
  setEditorState, // Enforced version (crashes outside pipeline)
  _initializeStateWrapper,
  _allowMutation,
  _blockMutation,
} from './StateWrapper';

// Invariants (fail-fast assertions)
export {
  assertEditorInvariants,
  assertNotRenderingDuringTyping,
  deepFreeze,
} from './invariants';

// Selection (read-only intent capture)
export {
  captureSelectionIntent,
  clearSelectionIntent,
  hasSelectionIntent,
} from './SelectionIntent';

// Caret placement (structural, not temporal)
export {
  schedulePlacement,
  clearPlacementQueue,
  hasPendingPlacements,
} from './CaretPlacement';
