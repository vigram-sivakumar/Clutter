/**
 * SEGMENTED EDITOR - PUBLIC API
 *
 * This is the ONLY interface NodeEditor.tsx should use.
 * NO direct access to node.segments allowed in UI code.
 */

// Core operations (mutating)
export {
  handleSegmentedEnter,
  handleSegmentedBackspace,
  handleSegmentedDelete,
  handleSegmentedInput,
  mergeWithPrevious,
  mergeWithNext,
  type EnterResult,
  type BackspaceResult,
  type InputResult,
} from '../engine/SegmentedEditor';

// Query operations (read-only)
export {
  matchGrammar,
  extractHashtags,
  matchQuery,
  extractReferences,
  getWordAtCursor,
  isNodeEmpty,
  getNodeLabel,
  type GrammarMatch,
  type QueryMatch,
} from '../engine/SegmentQuery';

// ✂️ PHASE 2.5: TYPING BUFFER EXPORTS DELETED
// Replaced with DOMObserver (see DOMObserver.ts)

// 🔒 EDITOR MODEL — Canonical document state (non-React)
// NOTE: Singleton EditorModel removed - use EditorModelIndex via modelRef.current
// export {
//   initializeModel,
//   getModel,
//   updateModel,
//   updateModelNodes,
//   updateModelCursor,
//   getModelNode,
//   getModelNodes,
//   getModelCursor,
// } from './EditorModel';

// 🔒 REMOVED: SegmentOps is internal only
// splitNodeAtCursor, mergeNodes are NOT exported
// Use handleSegmentedEnter/Backspace/etc instead
