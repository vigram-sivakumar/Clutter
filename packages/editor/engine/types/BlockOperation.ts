/**
 * BlockOperation - All possible operations on the block tree
 *
 * Every state change in the block engine is represented as an operation.
 * This enables:
 * - Testability (operations are pure functions)
 * - Undo/redo (replay operations)
 * - Collaboration (sync operations)
 * - Debugging (log all operations)
 * - Auditing (track all changes)
 *
 * Operations are discriminated unions - TypeScript enforces correctness.
 */

import type { Block, BlockType } from './Block';

/**
 * Insert a new block after a target block
 */
export interface InsertBlockOperation {
  type: 'insert';
  /** ID of block to insert after (null = insert at start) */
  afterId: string | null;
  /** The new block to insert */
  block: Block;
}

/**
 * Delete a block (and optionally its descendants)
 */
export interface DeleteBlockOperation {
  type: 'delete';
  /** ID of block to delete */
  id: string;
  /** Whether to delete descendants (default: true) */
  deleteDescendants?: boolean;
}

/**
 * Move a block to a new parent/position
 */
export interface MoveBlockOperation {
  type: 'move';
  /** ID of block to move */
  id: string;
  /** New parent ID (null = move to root) */
  newParent: string | null;
  /** Position in new parent's children array */
  index: number;
}

/**
 * Split a block at cursor position (Enter key)
 */
export interface SplitBlockOperation {
  type: 'split';
  /** ID of block to split */
  id: string;
  /** Cursor offset in content */
  offset: number;
}

/**
 * Merge a block with previous block (Backspace key)
 */
export interface MergeBlocksOperation {
  type: 'merge';
  /** ID of block to merge (will be deleted) */
  sourceId: string;
  /** ID of target block (content will be appended) */
  targetId: string;
}

/**
 * Update block content
 */
export interface UpdateContentOperation {
  type: 'updateContent';
  /** ID of block to update */
  id: string;
  /** New content */
  content: string;
}

/**
 * Update block description
 */
export interface UpdateDescriptionOperation {
  type: 'updateDescription';
  /** ID of block to update */
  id: string;
  /** New description (undefined = remove) */
  description: string | undefined;
}

/**
 * Update block type (convert paragraph → heading, etc.)
 */
export interface UpdateTypeOperation {
  type: 'updateType';
  /** ID of block to update */
  id: string;
  /** New block type */
  blockType: BlockType;
}

/**
 * Update block properties (extensible metadata)
 */
export interface UpdatePropertiesOperation {
  type: 'updateProperties';
  /** ID of block to update */
  id: string;
  /** Properties to merge (shallow merge) */
  properties: Record<string, any>;
}

/**
 * Union of all operation types
 */
export type BlockOperation =
  | InsertBlockOperation
  | DeleteBlockOperation
  | MoveBlockOperation
  | SplitBlockOperation
  | MergeBlocksOperation
  | UpdateContentOperation
  | UpdateDescriptionOperation
  | UpdateTypeOperation
  | UpdatePropertiesOperation;

/**
 * Result of applying an operation
 */
export interface OperationResult {
  /** Whether operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** IDs of blocks that were created */
  created?: string[];
  /** IDs of blocks that were deleted */
  deleted?: string[];
  /** IDs of blocks that were modified */
  modified?: string[];
}
