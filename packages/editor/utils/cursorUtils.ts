/**
 * Cursor Placement Utilities
 * 
 * 🔒 CURSOR PLACEMENT LAW:
 * You may NOT place a TextSelection at an arbitrary document offset.
 * You MUST place it inside the inline content of a textblock node.
 * 
 * Placing cursor at block boundaries causes ProseMirror to auto-repair,
 * which leads to:
 * - Next block text selection
 * - Indent collapse
 * - Phantom normalizations
 * 
 * This utility ensures cursor is always inside inline content.
 */

import type { Node as PMNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { Selection } from '@tiptap/pm/state';

/**
 * Place cursor at START of a block's inline content
 * 
 * 🔒 CRITICAL: This places cursor INSIDE the block's text content,
 * not at the block boundary. This prevents PM auto-repair.
 * 
 * Algorithm:
 * 1. Find block by blockId
 * 2. Verify it's a textblock (has inline content)
 * 3. Return pos + 1 (inside inline content, not at boundary)
 * 
 * @param doc - ProseMirror document
 * @param blockId - ID of target block
 * @returns TextSelection at start of block's inline content
 * @throws Error if block not found or not a textblock
 */
export function placeCursorAtBlockStart(
  doc: PMNode,
  blockId: string
): Selection {
  let cursorPos: number | null = null;
  let blockType: string | null = null;

  doc.descendants((node, pos) => {
    if (node.attrs?.blockId === blockId) {
      blockType = node.type.name;
      
      if (node.isTextblock) {
        // pos = start of block (boundary)
        // pos + 1 = inside inline content (safe for TextSelection)
        cursorPos = pos + 1;
        
      } else {
        
      }
      return false; // Stop searching
    }
    return true; // Continue
  });

  if (cursorPos === null) {
    throw new Error(
      `[Cursor][INVARIANT VIOLATION] Could not place cursor in block ${blockId.slice(0, 8)} (block not found or not textblock)`
    );
  }

  const selection = TextSelection.create(doc, cursorPos);
  
  // 🛡️ DEV INVARIANT: Verify cursor is inside a textblock
  if (process.env.NODE_ENV !== 'production') {
    const $from = selection.$from;
    if (!$from.parent.isTextblock) {
      throw new Error(
        `[Cursor][INVARIANT VIOLATION] Cursor placed outside textblock (blockId: ${blockId.slice(0, 8)})`
      );
    }
  }
  
  return selection;
}

/**
 * Place cursor at END of a block's inline content
 * 
 * Algorithm:
 * 1. Find block by blockId
 * 2. Verify it's a textblock
 * 3. Return pos + 1 + content.size (end of inline content)
 * 
 * @param doc - ProseMirror document
 * @param blockId - ID of target block
 * @returns TextSelection at end of block's inline content
 * @throws Error if block not found or not a textblock
 */
export function placeCursorAtBlockEnd(
  doc: PMNode,
  blockId: string
): Selection {
  let cursorPos: number | null = null;
  let blockType: string | null = null;

  doc.descendants((node, pos) => {
    if (node.attrs?.blockId === blockId) {
      blockType = node.type.name;
      
      if (node.isTextblock) {
        // pos = start of block (boundary)
        // pos + 1 = start of inline content
        // pos + 1 + content.size = end of inline content
        cursorPos = pos + 1 + node.content.size;
        
      } else {
        
      }
      return false; // Stop searching
    }
    return true; // Continue
  });

  if (cursorPos === null) {
    throw new Error(
      `[Cursor][INVARIANT VIOLATION] Could not place cursor in block ${blockId.slice(0, 8)} (block not found or not textblock)`
    );
  }

  const selection = TextSelection.create(doc, cursorPos);
  
  // 🛡️ DEV INVARIANT: Verify cursor is inside a textblock
  if (process.env.NODE_ENV !== 'production') {
    const $from = selection.$from;
    if (!$from.parent.isTextblock) {
      throw new Error(
        `[Cursor][INVARIANT VIOLATION] Cursor placed outside textblock (blockId: ${blockId.slice(0, 8)})`
      );
    }
  }
  
  return selection;
}

/**
 * Place cursor at a safe position (fallback)
 * 
 * When target block is unknown, find first available textblock
 * and place cursor at its start.
 * 
 * @param doc - ProseMirror document
 * @returns TextSelection at safe position
 */
export function placeCursorAtSafePosition(doc: PMNode): Selection {
  // Find first textblock in document
  let firstTextblockPos: number | null = null;
  
  doc.descendants((node, pos) => {
    if (node.isTextblock && firstTextblockPos === null) {
      firstTextblockPos = pos + 1; // Inside inline content
      return false; // Stop searching
    }
    return true;
  });
  
  if (firstTextblockPos === null) {
    // No textblocks found - use document start as absolute fallback
    
    firstTextblockPos = 1;
  }
  
  return TextSelection.create(doc, firstTextblockPos);
}
