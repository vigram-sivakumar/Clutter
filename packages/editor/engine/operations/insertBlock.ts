/**
 * insertBlock - Add a new block after a target block
 *
 * This is a pure function - takes state, returns new state.
 *
 * Rules:
 * - If afterId is null, insert as first root block
 * - If afterId exists, insert as next sibling
 * - Maintains tree integrity (updates parent's children array)
 * - Block must have unique ID
 */

import type { Block } from '../types';

export function insertBlock(
  blocks: Map<string, Block>,
  afterId: string | null,
  newBlock: Block
): Map<string, Block> {
  // Validate: Block ID must not exist
  if (blocks.has(newBlock.id)) {
    throw new Error(`Block with ID ${newBlock.id} already exists`);
  }

  // Create new map (immutable operation)
  const newBlocks = new Map(blocks);

  if (afterId === null) {
    // Insert as first root block
    newBlock.parent = null;
    newBlocks.set(newBlock.id, newBlock);
    return newBlocks;
  }

  // Get the target block
  const targetBlock = blocks.get(afterId);
  if (!targetBlock) {
    throw new Error(`Target block ${afterId} not found`);
  }

  // Insert as sibling of target block
  newBlock.parent = targetBlock.parent;
  newBlocks.set(newBlock.id, newBlock);

  // Update parent's children array
  if (targetBlock.parent !== null) {
    const parent = blocks.get(targetBlock.parent);
    if (!parent) {
      throw new Error(`Parent block ${targetBlock.parent} not found`);
    }

    const index = parent.children.indexOf(afterId);
    if (index === -1) {
      throw new Error(`Block ${afterId} not found in parent's children`);
    }

    // Create new parent with updated children
    const updatedParent: Block = {
      ...parent,
      children: [
        ...parent.children.slice(0, index + 1),
        newBlock.id,
        ...parent.children.slice(index + 1),
      ],
      updatedAt: Date.now(),
    };

    newBlocks.set(parent.id, updatedParent);
  }

  return newBlocks;
}
