/**
 * Tree Validation - Ensure tree integrity
 *
 * These validators catch bugs early by checking invariants:
 * - Every child's parent points back to parent
 * - Every parent's children array is correct
 * - No orphaned blocks (except roots)
 * - No cycles
 * - All IDs are unique
 *
 * Run these after every operation in development mode.
 */

import type { Block } from '../types';

/**
 * Validate tree structure integrity
 *
 * @throws Error if tree is invalid
 */
export function validateTree(blocks: Map<string, Block>): void {
  const errors: string[] = [];

  // 1. Check parent-child consistency
  for (const [id, block] of blocks) {
    // Validate children exist and point back
    for (const childId of block.children) {
      const child = blocks.get(childId);

      if (!child) {
        errors.push(`Block ${id} has non-existent child ${childId}`);
        continue;
      }

      if (child.parent !== id) {
        errors.push(
          `Block ${id} claims ${childId} as child, but ${childId}.parent = ${child.parent}`
        );
      }
    }

    // Validate parent exists (if not root)
    if (block.parent !== null) {
      const parent = blocks.get(block.parent);

      if (!parent) {
        errors.push(`Block ${id} has non-existent parent ${block.parent}`);
        continue;
      }

      if (!parent.children.includes(id)) {
        errors.push(
          `Block ${id} claims parent ${block.parent}, but parent doesn't list it as child`
        );
      }
    }
  }

  // 2. Check for cycles (no block should be ancestor of itself)
  for (const [id] of blocks) {
    if (hasCycle(blocks, id)) {
      errors.push(`Block ${id} has cycle in ancestor chain`);
    }
  }

  // 3. Check for duplicate IDs in children arrays
  for (const [id, block] of blocks) {
    const uniqueChildren = new Set(block.children);
    if (uniqueChildren.size !== block.children.length) {
      errors.push(`Block ${id} has duplicate children`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Tree validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`
    );
  }
}

/**
 * Check if a block has a cycle in its ancestor chain
 */
function hasCycle(blocks: Map<string, Block>, startId: string): boolean {
  const visited = new Set<string>();
  let currentId: string | null = startId;

  while (currentId !== null) {
    if (visited.has(currentId)) {
      return true; // Cycle detected
    }

    visited.add(currentId);
    const block = blocks.get(currentId);

    if (!block) {
      return false; // Invalid block, but not a cycle
    }

    currentId = block.parent;
  }

  return false;
}

/**
 * Get all root blocks (blocks with no parent)
 */
export function getRootBlocks(blocks: Map<string, Block>): Block[] {
  const roots: Block[] = [];

  for (const block of blocks.values()) {
    if (block.parent === null) {
      roots.push(block);
    }
  }

  return roots;
}

/**
 * Get all descendant IDs of a block (recursive)
 */
export function getDescendantIds(
  blocks: Map<string, Block>,
  blockId: string
): string[] {
  const block = blocks.get(blockId);
  if (!block) return [];

  const descendants: string[] = [];

  for (const childId of block.children) {
    descendants.push(childId);
    descendants.push(...getDescendantIds(blocks, childId));
  }

  return descendants;
}

/**
 * Get path from root to block (for breadcrumbs)
 */
export function getBlockPath(
  blocks: Map<string, Block>,
  blockId: string
): Block[] {
  const path: Block[] = [];
  let currentId: string | null = blockId;

  while (currentId !== null) {
    const block = blocks.get(currentId);
    if (!block) break;

    path.unshift(block);
    currentId = block.parent;
  }

  return path;
}

/**
 * Get next sibling block ID
 */
export function getNextSiblingId(
  blocks: Map<string, Block>,
  blockId: string
): string | null {
  const block = blocks.get(blockId);
  if (!block || block.parent === null) return null;

  const parent = blocks.get(block.parent);
  if (!parent) return null;

  const index = parent.children.indexOf(blockId);
  if (index === -1 || index === parent.children.length - 1) return null;

  return parent.children[index + 1];
}

/**
 * Get previous sibling block ID
 */
export function getPreviousSiblingId(
  blocks: Map<string, Block>,
  blockId: string
): string | null {
  const block = blocks.get(blockId);
  if (!block || block.parent === null) return null;

  const parent = blocks.get(block.parent);
  if (!parent) return null;

  const index = parent.children.indexOf(blockId);
  if (index <= 0) return null;

  return parent.children[index - 1];
}
