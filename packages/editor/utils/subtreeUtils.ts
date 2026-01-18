/**
 * Subtree Collection Utilities
 * 
 * 🔒 SUBTREE LAW (Canonical):
 * A subtree is the continuous run of blocks that:
 * 1. Start immediately after the parent
 * 2. Have indent > parent.indent
 * 3. STOP at the first block whose indent <= parent.indent (and NEVER resume)
 * 
 * This is the ONLY valid definition of a subtree in the flat model.
 * Used by: copy, cut, delete, multi-select, collapse (future)
 */

import type { Node as PMNode } from '@tiptap/pm/model';

export interface BlockWithPosition {
  node: PMNode;
  pos: number;
  indent: number;
}

/**
 * Collect a block and its entire visual subtree (indent-based)
 * 
 * 🔒 CRITICAL: Once boundary (indent <= baseIndent) is hit, collection STOPS FOREVER.
 * No skipping. No resuming. No second chance.
 * 
 * Algorithm:
 * 1. Start at anchor block (index or position)
 * 2. Collect all immediately following blocks with indent > baseIndent
 * 3. STOP permanently at first block with indent <= baseIndent
 * 
 * Example:
 *   1 (indent=0)
 *     2 (indent=1) ← continuous subtree starts
 *     3 (indent=1) ← continuous subtree continues
 *   4 (indent=0) ← BOUNDARY HIT, STOP FOREVER
 *     5 (indent=1) ← NOT part of subtree (new parent)
 * 
 * Subtree for block 1 = [1, 2, 3] (NOT [1, 2, 3, 5])
 * 
 * @param blocks - Array of all blocks in document order
 * @param anchorIndex - Index of parent block in blocks array
 * @returns Array of blocks in subtree (including anchor)
 */
export function collectSubtreeFromIndex(
  blocks: BlockWithPosition[],
  anchorIndex: number
): BlockWithPosition[] {
  if (anchorIndex < 0 || anchorIndex >= blocks.length) {
    
    return [];
  }

  const anchor = blocks[anchorIndex];
  const baseIndent = anchor.indent;
  const subtree: BlockWithPosition[] = [anchor];

  // Collect continuous children
  for (let i = anchorIndex + 1; i < blocks.length; i++) {
    const block = blocks[i];

    // 🔒 HARD STOP — cannot re-enter subtree
    // Once indent <= baseIndent, we've hit a sibling or outdent
    if (block.indent <= baseIndent) {
      
      break; // STOP FOREVER
    }

    // Child block - add to subtree
    subtree.push(block);
  }

  return subtree;
}

/**
 * Collect subtree from ProseMirror document by block position
 * 
 * This is a convenience wrapper around collectSubtreeFromIndex
 * that first collects all blocks, then finds the anchor.
 * 
 * @param doc - ProseMirror document
 * @param startPos - Position of anchor block (from doc.forEach offset)
 * @returns Array of {node, pos} for parent + all children
 */
export function collectSubtreeFromDoc(
  doc: PMNode,
  startPos: number
): Array<{ node: PMNode; pos: number }> {
  // Step 1: Collect all blocks with positions
  const blocks: BlockWithPosition[] = [];
  doc.forEach((node, offset) => {
    if (node.attrs?.blockId) {
      blocks.push({
        node,
        pos: offset,
        indent: node.attrs.indent ?? 0,
      });
    }
  });

  // Step 2: Find anchor index
  const anchorIndex = blocks.findIndex((b) => b.pos === startPos);
  if (anchorIndex === -1) {
    return [];
  }

  // Step 3: Collect subtree using canonical algorithm
  const subtree = collectSubtreeFromIndex(blocks, anchorIndex);

  // Step 4: Return in expected format
  return subtree.map((b) => ({ node: b.node, pos: b.pos }));
}

/**
 * 🛡️ DEV INVARIANT: Validate subtree structure
 * 
 * Ensures:
 * 1. First block is the anchor (baseIndent)
 * 2. All following blocks have indent > baseIndent
 * 3. No indent jumps > 1 (e.g., 0 → 2 without 1)
 */
export function validateSubtree(subtree: BlockWithPosition[]): boolean {
  if (subtree.length === 0) return true;

  const anchor = subtree[0];
  const baseIndent = anchor.indent;

  for (let i = 1; i < subtree.length; i++) {
    const block = subtree[i];

    // All children must have indent > baseIndent
    if (block.indent <= baseIndent) {
      
      return false;
    }

    // No invalid jumps (e.g., 0 → 2)
    const prev = subtree[i - 1];
    if (block.indent > prev.indent + 1) {
      
      return false;
    }
  }

  return true;
}
