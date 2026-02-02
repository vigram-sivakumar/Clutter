/**
 * deleteBlock - Remove a block (and optionally its descendants)
 *
 * This is a pure function - takes state, returns new state.
 *
 * Rules:
 * - Deletes block and all descendants by default
 * - Updates parent's children array
 * - Orphaned descendants are also deleted
 */

import type { Block } from '../types';
import { getDescendantIds } from '../utils/treeValidation';

export function deleteBlock(
  blocks: Map<string, Block>,
  blockId: string,
  deleteDescendants: boolean = true
): Map<string, Block> {
  const block = blocks.get(blockId);
  if (!block) {
    throw new Error(`Block ${blockId} not found`);
  }

  // Create new map (immutable operation)
  const newBlocks = new Map(blocks);

  // Get all blocks to delete
  const toDelete: string[] = [blockId];
  if (deleteDescendants) {
    toDelete.push(...getDescendantIds(blocks, blockId));
  }

  // Delete all blocks
  for (const id of toDelete) {
    newBlocks.delete(id);
  }

  // Update parent's children array
  if (block.parent !== null) {
    const parent = blocks.get(block.parent);
    if (parent) {
      const updatedParent: Block = {
        ...parent,
        children: parent.children.filter((childId) => childId !== blockId),
        updatedAt: Date.now(),
      };
      newBlocks.set(parent.id, updatedParent);
    }
  }

  return newBlocks;
}
