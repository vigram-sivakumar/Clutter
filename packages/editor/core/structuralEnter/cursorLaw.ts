// packages/editor/core/structuralEnter/cursorLaw.ts

import type { EnterContext, StructuralEnterResult } from './types';

/**
 * 🔒 INDENTED CHILDREN DETECTION
 *
 * Checks if a block has indented blocks below it (visual hierarchy).
 * This is different from explicit parent-child relationships.
 *
 * A block has indented children if:
 * - There exists a block AFTER it in document order
 * - Whose indent > current block's indent
 * - Before we hit a block with indent <= current block's indent
 *
 * @returns true if block has direct indented children (indent === baseIndent + 1)
 */
function hasIndentedChildren(context: EnterContext): boolean {
  const { pmDoc, blockId, indent: baseIndent } = context;

  if (!pmDoc) {
    return false;
  }

  // Collect all blocks in document order with their indents
  const blocks: Array<{ blockId: string; indent: number }> = [];
  pmDoc.descendants((node: any) => {
    if (node.isBlock && node.attrs?.blockId) {
      blocks.push({
        blockId: node.attrs.blockId,
        indent: node.attrs.indent !== undefined ? node.attrs.indent : 0,
      });
    }
    return false; // Don't descend into block children
  });

  // Find current block's index
  const currentIndex = blocks.findIndex((b) => b.blockId === blockId);
  if (currentIndex === -1) {
    return false;
  }

  // Check if next block is indented
  for (let i = currentIndex + 1; i < blocks.length; i++) {
    const nextBlock = blocks[i];
    if (!nextBlock) continue; // Guard (should never happen)

    // Stop at same or lower indent
    if (nextBlock.indent <= baseIndent) {
      break;
    }

    // Found a direct child (one level deeper)
    if (nextBlock.indent === baseIndent + 1) {
      return true;
    }

    // Deeper levels (grandchildren) don't count as direct children
  }

  return false;
}

/**
 * 🔒 HIERARCHY-DRIVEN INSERTION RULE
 *
 * Determines if the current block should create a child vs sibling.
 * This encodes the fundamental rule: "Hierarchy wins over cursor position"
 *
 * Uses INDENTED CHILDREN (visual hierarchy), not explicit parent-child relationships.
 * This aligns Enter with Delete, Subtree, and Promotion logic.
 *
 * @returns true if Enter should create a child (not a sibling)
 */
function canCreateChild(context: EnterContext): boolean {
  const { blockType } = context;

  // Toggles always create children (even when empty)
  if (blockType === 'toggle') return true;

  // Any block with indented children should create a child
  // This preserves visual hierarchy continuity
  return hasIndentedChildren(context);
}

/**
 * 🔒 CURSOR LAW (PURE LOGIC)
 *
 * Determines structural intent based on cursor position, block state, and hierarchy.
 *
 * Priority order:
 * 1. Empty block → EXIT (create sibling below)
 * 2. Cursor at end + block has children → CREATE CHILD (hierarchy-preserving)
 * 3. Cursor at start → CREATE SIBLING ABOVE
 * 4. Cursor at end → CREATE SIBLING BELOW
 * 5. Cursor in middle → SPLIT BLOCK
 *
 * This function has NO side effects, does NOT access PM, and does NOT execute changes.
 */
export function resolveStructuralEnter(
  context: EnterContext
): StructuralEnterResult {
  const {
    isEmpty,
    atStart,
    atEnd,
    blockId,
    blockType,
    engine: _engine,
  } = context;

  // 🔒 RULE 1: Empty block → EXIT (create sibling below)
  if (isEmpty) {
    return {
      intent: { kind: 'create-sibling-below' },
      cursor: { block: 'created', placement: 'start' },
    };
  }

  // 🔒 RULE 2: CHILD-FIRST PREFERENCE (hierarchy-preserving)
  // If cursor is at end AND block has indented children, create child (not sibling)

  if (atEnd && canCreateChild(context)) {
    return {
      intent: { kind: 'create-child' },
      cursor: { block: 'created', placement: 'start' },
    };
  }

  // 🔒 RULE 3: Cursor at start → create sibling ABOVE
  if (atStart) {
    return {
      intent: { kind: 'create-sibling-above' },
      cursor: { block: 'created', placement: 'start' },
    };
  }

  // 🔒 RULE 4: Cursor at end → create sibling BELOW
  if (atEnd) {
    return {
      intent: { kind: 'create-sibling-below' },
      cursor: { block: 'created', placement: 'start' },
    };
  }

  // 🔒 RULE 5: Cursor in middle → split block
  return {
    intent: { kind: 'split-block' },
    cursor: { block: 'created', placement: 'start' },
  };
}
