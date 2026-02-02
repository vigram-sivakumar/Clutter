/**
 * Blocks Serialization
 *
 * Convert block store state to storage format and back.
 */

import type { Block } from '../types/Block';
import type { BlocksDocument } from './types';

/**
 * Serialize blocks to storage format
 *
 * @param blocks - All blocks from store
 * @returns JSON-serializable document
 */
export function serializeBlocks(blocks: Block[]): BlocksDocument {
  // Calculate metadata
  const wordCount = blocks.reduce((count, block) => {
    // Extract plain text from Lexical JSON
    try {
      const lexicalState = JSON.parse(block.content);
      const text = extractTextFromLexical(lexicalState);
      return count + text.split(/\s+/).filter(Boolean).length;
    } catch {
      return count;
    }
  }, 0);

  const rootBlocks = blocks.filter((b) => !b.parent);

  return {
    version: 2,
    format: 'blocks',
    blocks,
    rootIds: rootBlocks.map((b) => b.id),
    metadata: {
      updatedAt: Date.now(),
      wordCount,
      blockCount: blocks.length,
    },
  };
}

/**
 * Deserialize blocks from storage format
 *
 * @param doc - Stored document
 * @returns Array of blocks
 */
export function deserializeBlocks(doc: BlocksDocument): Block[] {
  // Validate blocks
  if (!Array.isArray(doc.blocks)) {
    console.error('[Serialization] Invalid blocks array');
    return [];
  }

  // Return blocks as-is (already in correct format)
  return doc.blocks;
}

/**
 * Serialize blocks to JSON string (for storage)
 *
 * @param blocks - All blocks from store
 * @returns JSON string
 */
export function serializeBlocksToJSON(blocks: Block[]): string {
  const doc = serializeBlocks(blocks);
  return JSON.stringify(doc);
}

/**
 * Deserialize blocks from JSON string
 *
 * @param json - JSON string from storage
 * @returns Array of blocks, or null if invalid
 */
export function deserializeBlocksFromJSON(json: string): Block[] | null {
  try {
    const doc = JSON.parse(json);

    // Verify it's blocks format
    if (doc.version !== 2 || doc.format !== 'blocks') {
      return null;
    }

    return deserializeBlocks(doc);
  } catch (error) {
    console.error('[Serialization] Failed to parse JSON:', error);
    return null;
  }
}

/**
 * Extract plain text from Lexical JSON
 *
 * @param state - Lexical editor state
 * @returns Plain text content
 */
function extractTextFromLexical(state: any): string {
  if (!state?.root?.children) return '';

  const extractFromNode = (node: any): string => {
    if (node.type === 'text') {
      return node.text || '';
    }
    if (node.children) {
      return node.children.map(extractFromNode).join('');
    }
    return '';
  };

  return state.root.children.map(extractFromNode).join(' ').trim();
}
