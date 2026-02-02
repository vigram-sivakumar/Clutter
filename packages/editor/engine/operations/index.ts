/**
 * Block Operations - Pure functions for state transformations
 *
 * All operations:
 * - Are pure functions (no side effects)
 * - Take current state, return new state
 * - Are immutable (create new Map/objects)
 * - Are unit testable
 * - Can be replayed for undo/redo
 * - Can be synced for collaboration
 */

export { insertBlock } from './insertBlock';
export { deleteBlock } from './deleteBlock';
export { moveBlock } from './moveBlock';
export { splitBlock } from './splitBlock';
export type { SplitResult } from './splitBlock';
export { mergeBlocks } from './mergeBlocks';
export type { MergeResult } from './mergeBlocks';
export {
  updateContent,
  updateDescription,
  updateType,
  updateProperties,
} from './updateBlock';
