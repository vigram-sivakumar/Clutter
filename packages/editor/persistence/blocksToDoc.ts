/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * BLOCKS TO PROSEMIRROR DOCUMENT (Apple Notes Architecture)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * Converts blocks from SQLite snapshot to ProseMirror document JSON.
 * This is the bridge between storage and editor.
 */

import type { BlockData } from './loadBlocksForNote';

/**
 * Convert blocks from SQLite to ProseMirror document JSON.
 * 
 * @param blocks - Array of blocks from `loadBlocksForNote()`
 * @returns ProseMirror JSON object ready for editor initialization
 */
export function blocksToDoc(blocks: BlockData[]): object {
  if (blocks.length === 0) {
    // ✅ APPLE NOTES SAFETY NET: Never return empty doc
    // ProseMirror requires at least one valid paragraph to be editable
    // ⚠️ CRITICAL: No empty text nodes - ProseMirror forbids text: ""
    return {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { blockId: 'ephemeral' }, // Temporary ID until BlockIdGenerator assigns real one
      }],
    };
  }

  // Convert each block to ProseMirror node format
  const pmBlocks = blocks.map((block) => {
    // ✅ If content is JSON-stringified ProseMirror node, parse it (lossless)
    if (block.content && block.content.startsWith('{')) {
      try {
        return JSON.parse(block.content);
      } catch {
        // Fallback for legacy text-only blocks
        // ⚠️ CRITICAL: No empty arrays - omit content key if no text
        const node: any = {
          type: block.type,
          attrs: { blockId: block.blockId, ...block.attrs },
        };
        if (block.content) {
          node.content = [{ type: 'text', text: block.content }];
        }
        return node;
      }
    }
    
    // Legacy path (text-only blocks)
    // ⚠️ CRITICAL: No empty arrays - omit content key if no text
    const node: any = {
      type: block.type,
      attrs: { blockId: block.blockId, ...block.attrs },
    };
    if (block.content) {
      node.content = [{ type: 'text', text: block.content }];
    }
    return node;
  });

  return {
    type: 'doc',
    content: pmBlocks,
  };
}
