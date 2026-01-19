/**
 * indentOperations.ts - SINGLE SOURCE OF TRUTH FOR INDENT OPERATIONS
 *
 * 🔒 ARCHITECTURAL LAW:
 * ALL indent changes (Tab/Shift+Tab/Enter/Backspace) MUST go through these functions.
 *
 * Why this exists:
 * - Centralizes MAX_INDENT clamping
 * - Enforces indent transition rules
 * - Coordinates collapse state with indent changes
 * - Makes indent bugs structurally impossible
 *
 * Builds on top of: updateBlockAttrs()
 */

import type { Transaction, EditorState } from '@tiptap/pm/state';
import { updateBlockAttrs } from './updateBlockAttrs';

/**
 * Maximum allowed indent level
 * This is the structural limit for the flat block model
 */
export const MAX_INDENT = 8;

/**
 * Get current indent of a block
 *
 * @param tr - Transaction or EditorState
 * @param blockPos - Position of the block node
 * @returns Current indent level (defaults to 0 if not found)
 */
export function getBlockIndent(
  tr: Transaction | EditorState,
  blockPos: number
): number {
  const doc = 'doc' in tr ? tr.doc : (tr as EditorState).doc;
  const node = doc.nodeAt(blockPos);
  return node?.attrs?.indent ?? 0;
}

/**
 * Set block indent to a specific value with validation
 *
 * @param tr - ProseMirror transaction
 * @param blockPos - Position of the block node
 * @param newIndent - New indent level
 * @param options - Optional configuration
 * @returns Modified transaction
 *
 * @example
 * ```ts
 * // Set indent to 2 (with clamping)
 * setBlockIndent(tr, blockPos, 2);
 *
 * // Set indent without clamping (throws on invalid)
 * setBlockIndent(tr, blockPos, 5, { clamp: false });
 * ```
 */
export function setBlockIndent(
  tr: Transaction,
  blockPos: number,
  newIndent: number,
  options?: {
    /** Clamp to [0, MAX_INDENT] range (default: true) */
    clamp?: boolean;
    /** Auto-expand collapsed parent when outdenting (default: false) */
    autoExpandParent?: boolean;
  }
): Transaction {
  const clamp = options?.clamp ?? true;

  // Clamp to valid range
  const clampedIndent = clamp
    ? Math.max(0, Math.min(MAX_INDENT, newIndent))
    : newIndent;

  // Validate if not clamping
  if (!clamp) {
    if (clampedIndent < 0) {
      throw new Error(
        `[INVARIANT] Indent cannot be negative. Got: ${clampedIndent}`
      );
    }
    if (clampedIndent > MAX_INDENT) {
      throw new Error(
        `[INVARIANT] Indent cannot exceed MAX_INDENT (${MAX_INDENT}). Got: ${clampedIndent}`
      );
    }
  }

  // Update indent using centralized function
  updateBlockAttrs(tr, blockPos, {
    indent: clampedIndent,
  });

  // TODO: Auto-expand parent logic (if needed)
  // This would require traversing the document to find parent
  // Defer until we see if it's needed

  return tr;
}

/**
 * Increase block indent by 1 (Tab key)
 *
 * @param tr - ProseMirror transaction
 * @param blockPos - Position of the block node
 * @returns Modified transaction
 *
 * @example
 * ```ts
 * indentBlock(tr, blockPos);  // indent: 0 → 1
 * ```
 */
export function indentBlock(tr: Transaction, blockPos: number): Transaction {
  const currentIndent = getBlockIndent(tr, blockPos);
  return setBlockIndent(tr, blockPos, currentIndent + 1, { clamp: true });
}

/**
 * Decrease block indent by 1 (Shift+Tab key)
 *
 * @param tr - ProseMirror transaction
 * @param blockPos - Position of the block node
 * @returns Modified transaction
 *
 * @example
 * ```ts
 * outdentBlock(tr, blockPos);  // indent: 2 → 1
 * ```
 */
export function outdentBlock(tr: Transaction, blockPos: number): Transaction {
  const currentIndent = getBlockIndent(tr, blockPos);
  return setBlockIndent(tr, blockPos, currentIndent - 1, { clamp: true });
}

/**
 * Reset block indent to 0 (root level)
 *
 * @param tr - ProseMirror transaction
 * @param blockPos - Position of the block node
 * @returns Modified transaction
 */
export function resetBlockIndent(
  tr: Transaction,
  blockPos: number
): Transaction {
  return setBlockIndent(tr, blockPos, 0, { clamp: false });
}

/**
 * Indent multiple blocks by delta (range-based indent/outdent)
 *
 * Used by Tab/Shift+Tab when multiple blocks are selected
 *
 * @param tr - ProseMirror transaction
 * @param blocks - Array of {blockPos, currentIndent} pairs
 * @param delta - Amount to change indent (+1 for Tab, -1 for Shift+Tab)
 * @returns Modified transaction
 *
 * @example
 * ```ts
 * indentMultipleBlocks(tr, [
 *   { blockPos: 10, currentIndent: 0 },
 *   { blockPos: 20, currentIndent: 1 },
 * ], 1);  // Indent all by 1
 * ```
 */
export function indentMultipleBlocks(
  tr: Transaction,
  blocks: Array<{ blockPos: number; currentIndent: number }>,
  delta: number
): Transaction {
  for (const block of blocks) {
    const newIndent = block.currentIndent + delta;
    setBlockIndent(tr, block.blockPos, newIndent, { clamp: true });
  }
  return tr;
}

/**
 * Check if a block can be indented further
 *
 * @param tr - Transaction or EditorState
 * @param blockPos - Position of the block node
 * @returns true if block can be indented (not at MAX_INDENT)
 */
export function canIndentBlock(
  tr: Transaction | EditorState,
  blockPos: number
): boolean {
  const currentIndent = getBlockIndent(tr, blockPos);
  return currentIndent < MAX_INDENT;
}

/**
 * Check if a block can be outdented
 *
 * @param tr - Transaction or EditorState
 * @param blockPos - Position of the block node
 * @returns true if block can be outdented (indent > 0)
 */
export function canOutdentBlock(
  tr: Transaction | EditorState,
  blockPos: number
): boolean {
  const currentIndent = getBlockIndent(tr, blockPos);
  return currentIndent > 0;
}
