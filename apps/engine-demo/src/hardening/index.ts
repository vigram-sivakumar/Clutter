/**
 * 🔒 HARDENING EXPORTS
 * 
 * Single entry point for all architectural enforcement.
 */

// Runtime invariants
export {
  assertValidNode,
  assertValidCursor,
  assertSplitPreservesContent,
  assertMergePreservesContent,
  assertNodeIntegrity,
  assertCommitIntegrity,
} from './invariants';

// Keyboard ownership
export {
  KeyboardOwnership,
  isBrowserOwned,
  isEditorOwned,
  assertKeyboardOwnership,
  getKeyOwner,
} from './keyboard-ownership';

// Split state machine
export {
  type SplitCase,
  determineSplitCase,
  executeSplit,
  performGuaranteedSplit,
} from './split-state-machine';

// Forbidden patterns (for documentation)
export {
  FORBIDDEN_PATTERNS,
  type ForbiddenPattern,
} from './forbidden';
