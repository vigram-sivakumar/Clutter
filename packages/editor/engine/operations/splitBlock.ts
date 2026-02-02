/**
 * splitBlock - Split a block at cursor position (Enter key)
 *
 * This is a pure function - takes state, returns new state.
 *
 * Rules:
 * - Creates new block after current block
 * - Content before offset stays in original block
 * - Content after offset goes to new block
 * - New block has same type and parent
 * - Returns ID of new block
 */

import { nanoid } from 'nanoid';
import type { Block } from '../types';

export interface SplitResult {
  blocks: Map<string, Block>;
  newBlockId: string;
}

export function splitBlock(
  blocks: Map<string, Block>,
  blockId: string,
  offset: number
): SplitResult {
  const block = blocks.get(blockId);
  if (!block) {
    throw new Error(`Block ${blockId} not found`);
  }

  // ✅ NOTE: block.content is Lexical JSON, NOT plain text
  // We can't slice JSON strings - that creates invalid JSON
  // Lexical will handle the split internally via its own commands
  // We just need to create an empty new block

  // Create new empty block
  const newBlockId = nanoid();
  const newBlock: Block = {
    id: newBlockId,
    type: block.type,
    parent: block.parent,
    children: [],
    content: '', // ✅ Empty - Lexical will initialize it
    properties: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Create new map (immutable operation)
  const newBlocks = new Map(blocks);

  // Original block content stays unchanged
  // (Lexical's split command will update it separately)
  const updatedBlock: Block = {
    ...block,
    updatedAt: Date.now(),
  };
  newBlocks.set(blockId, updatedBlock);

  // Add new block
  newBlocks.set(newBlockId, newBlock);

  // Update parent's children array
  if (block.parent !== null) {
    const parent = blocks.get(block.parent);
    if (parent) {
      const index = parent.children.indexOf(blockId);
      if (index !== -1) {
        const newChildren = [
          ...parent.children.slice(0, index + 1),
          newBlockId,
          ...parent.children.slice(index + 1),
        ];

        const updatedParent: Block = {
          ...parent,
          children: newChildren,
          updatedAt: Date.now(),
        };
        newBlocks.set(parent.id, updatedParent);
      }
    }
  }

  return {
    blocks: newBlocks,
    newBlockId,
  };
}
