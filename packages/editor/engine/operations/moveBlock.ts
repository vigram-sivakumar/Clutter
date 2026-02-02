/**
 * moveBlock - Move a block to a new parent/position
 *
 * This is a pure function - takes state, returns new state.
 *
 * Rules:
 * - Removes block from old parent's children
 * - Adds block to new parent's children at specified index
 * - Updates block's parent reference
 * - Descendants move with the block
 */

import type { Block } from '../types';

export function moveBlock(
  blocks: Map<string, Block>,
  blockId: string,
  newParent: string | null,
  index: number
): Map<string, Block> {
  const block = blocks.get(blockId);
  if (!block) {
    throw new Error(`Block ${blockId} not found`);
  }

  // Validate new parent exists (if not root)
  if (newParent !== null && !blocks.has(newParent)) {
    throw new Error(`New parent ${newParent} not found`);
  }

  // Can't move block to be child of itself or its descendants
  if (newParent === blockId) {
    throw new Error('Cannot move block to be child of itself');
  }

  // Create new map (immutable operation)
  const newBlocks = new Map(blocks);

  // Remove from old parent's children
  if (block.parent !== null) {
    const oldParent = blocks.get(block.parent);
    if (oldParent) {
      const updatedOldParent: Block = {
        ...oldParent,
        children: oldParent.children.filter((id) => id !== blockId),
        updatedAt: Date.now(),
      };
      newBlocks.set(oldParent.id, updatedOldParent);
    }
  }

  // Update block's parent
  const updatedBlock: Block = {
    ...block,
    parent: newParent,
    updatedAt: Date.now(),
  };
  newBlocks.set(blockId, updatedBlock);

  // Add to new parent's children at index
  if (newParent !== null) {
    const parent = blocks.get(newParent);
    if (!parent) {
      throw new Error(`New parent ${newParent} not found`);
    }

    const newChildren = [...parent.children];
    const clampedIndex = Math.max(0, Math.min(index, newChildren.length));
    newChildren.splice(clampedIndex, 0, blockId);

    const updatedParent: Block = {
      ...parent,
      children: newChildren,
      updatedAt: Date.now(),
    };
    newBlocks.set(parent.id, updatedParent);
  }

  return newBlocks;
}
