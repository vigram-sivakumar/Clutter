/**
 * mergeBlocks - Merge source block with target block (Backspace key)
 *
 * This is a pure function - takes state, returns new state.
 *
 * Rules:
 * - Appends source block content to target block
 * - Deletes source block
 * - Children of source block move to target block
 * - Returns offset in target where content was appended
 */

import type { Block } from '../types';

export interface MergeResult {
  blocks: Map<string, Block>;
  cursorOffset: number;
}

export function mergeBlocks(
  blocks: Map<string, Block>,
  sourceId: string,
  targetId: string
): MergeResult {
  const sourceBlock = blocks.get(sourceId);
  const targetBlock = blocks.get(targetId);

  if (!sourceBlock) {
    throw new Error(`Source block ${sourceId} not found`);
  }
  if (!targetBlock) {
    throw new Error(`Target block ${targetId} not found`);
  }

  // Calculate cursor position (end of target content)
  const cursorOffset = targetBlock.content.length;

  // Merge content
  const mergedContent = targetBlock.content + sourceBlock.content;

  // Create new map (immutable operation)
  const newBlocks = new Map(blocks);

  // Update target block with merged content
  const updatedTarget: Block = {
    ...targetBlock,
    content: mergedContent,
    children: [...targetBlock.children, ...sourceBlock.children],
    updatedAt: Date.now(),
  };
  newBlocks.set(targetId, updatedTarget);

  // Update source block's children to point to target
  for (const childId of sourceBlock.children) {
    const child = blocks.get(childId);
    if (child) {
      const updatedChild: Block = {
        ...child,
        parent: targetId,
        updatedAt: Date.now(),
      };
      newBlocks.set(childId, updatedChild);
    }
  }

  // Remove source block from parent's children
  if (sourceBlock.parent !== null) {
    const parent = blocks.get(sourceBlock.parent);
    if (parent) {
      const updatedParent: Block = {
        ...parent,
        children: parent.children.filter((id) => id !== sourceId),
        updatedAt: Date.now(),
      };
      newBlocks.set(parent.id, updatedParent);
    }
  }

  // Delete source block
  newBlocks.delete(sourceId);

  return {
    blocks: newBlocks,
    cursorOffset,
  };
}
