/**
 * updateBlock - Update operations for block content and metadata
 *
 * These are pure functions - take state, return new state.
 */

import type { Block, BlockType } from '../types';

/**
 * Update block content
 */
export function updateContent(
  blocks: Map<string, Block>,
  blockId: string,
  content: string
): Map<string, Block> {
  const block = blocks.get(blockId);
  if (!block) {
    throw new Error(`Block ${blockId} not found`);
  }

  const newBlocks = new Map(blocks);
  const updatedBlock: Block = {
    ...block,
    content,
    updatedAt: Date.now(),
  };
  newBlocks.set(blockId, updatedBlock);

  return newBlocks;
}

/**
 * Update block description
 */
export function updateDescription(
  blocks: Map<string, Block>,
  blockId: string,
  description: string | undefined
): Map<string, Block> {
  const block = blocks.get(blockId);
  if (!block) {
    throw new Error(`Block ${blockId} not found`);
  }

  const newBlocks = new Map(blocks);
  const updatedBlock: Block = {
    ...block,
    description,
    updatedAt: Date.now(),
  };
  newBlocks.set(blockId, updatedBlock);

  return newBlocks;
}

/**
 * Update block type (convert paragraph → heading, etc.)
 */
export function updateType(
  blocks: Map<string, Block>,
  blockId: string,
  type: BlockType
): Map<string, Block> {
  const block = blocks.get(blockId);
  if (!block) {
    throw new Error(`Block ${blockId} not found`);
  }

  const newBlocks = new Map(blocks);
  const updatedBlock: Block = {
    ...block,
    type,
    updatedAt: Date.now(),
  };
  newBlocks.set(blockId, updatedBlock);

  return newBlocks;
}

/**
 * Update block properties (merge)
 */
export function updateProperties(
  blocks: Map<string, Block>,
  blockId: string,
  properties: Record<string, any>
): Map<string, Block> {
  const block = blocks.get(blockId);
  if (!block) {
    throw new Error(`Block ${blockId} not found`);
  }

  const newBlocks = new Map(blocks);
  const updatedBlock: Block = {
    ...block,
    properties: {
      ...block.properties,
      ...properties,
    },
    updatedAt: Date.now(),
  };
  newBlocks.set(blockId, updatedBlock);

  return newBlocks;
}
