/**
 * updateBlockAttrs() - SINGLE SOURCE OF TRUTH FOR ATTRIBUTE UPDATES
 *
 * 🔒 ARCHITECTURAL LAW:
 * ALL block attribute updates MUST go through this function.
 * No raw setNodeMarkup calls. No exceptions.
 *
 * Why this exists:
 * - Prevents accidental attribute loss (especially blockId)
 * - Enforces invariants (blockId immutable, indent >= 0, etc.)
 * - Centralizes validation
 * - Makes attribute bugs structurally impossible
 *
 * Mental Model:
 * User action (Tab/Backspace/Toggle)
 *   ↓
 * Intent resolver
 *   ↓
 * updateBlockAttrs() ← YOU ARE HERE
 *   ↓
 * ProseMirror transaction
 */

import type { Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';

/**
 * Updatable block attributes
 * blockId is intentionally excluded - it's immutable
 */
export type UpdatableBlockAttrs = {
  indent?: number;
  collapsed?: boolean;
  tags?: string[];
  listType?: 'bullet' | 'numbered' | 'task' | 'toggle';
  checked?: boolean | null;
  priority?: number;
  headingLevel?: 1 | 2 | 3;
  type?: 'info' | 'warning' | 'error' | 'success'; // callout type
  language?: string; // codeBlock language
  style?: 'plain' | 'wavy'; // horizontalRule style
  fullWidth?: boolean; // horizontalRule
  color?: string; // horizontalRule
};

/**
 * Update block attributes safely
 *
 * 🔒 INVARIANTS ENFORCED:
 * - blockId is NEVER changed (immutable after creation)
 * - All existing attributes are preserved unless explicitly updated
 * - Invalid attribute updates throw errors (fail fast)
 *
 * @param tr - ProseMirror transaction
 * @param blockPos - Position of the block node (use $from.before())
 * @param updates - Partial attributes to update
 * @returns Modified transaction
 *
 * @example
 * ```ts
 * // Increase indent
 * updateBlockAttrs(tr, blockPos, { indent: 2 });
 *
 * // Toggle collapse
 * updateBlockAttrs(tr, blockPos, { collapsed: true });
 *
 * // Update multiple attrs
 * updateBlockAttrs(tr, blockPos, {
 *   indent: 1,
 *   collapsed: false,
 *   tags: ['urgent']
 * });
 * ```
 */
export function updateBlockAttrs(
  tr: Transaction,
  blockPos: number,
  updates: UpdatableBlockAttrs
): Transaction {
  const node = tr.doc.nodeAt(blockPos);
  if (!node) {
    console.error('[updateBlockAttrs] No node at position', blockPos);
    return tr;
  }

  // 🔒 INVARIANT: blockId is IMMUTABLE
  if ('blockId' in updates) {
    throw new Error(
      '[INVARIANT VIOLATION] blockId cannot be updated. It is immutable after block creation.'
    );
  }

  // 🔒 INVARIANT: indent must be non-negative
  if (updates.indent !== undefined && updates.indent < 0) {
    throw new Error(
      `[INVARIANT VIOLATION] indent cannot be negative. Got: ${updates.indent}`
    );
  }

  // 🔒 INVARIANT: Preserve blockId explicitly
  const updatedAttrs = {
    ...node.attrs,
    ...updates,
    blockId: node.attrs.blockId, // Force preservation
  };

  // Apply update
  tr.setNodeMarkup(blockPos, undefined, updatedAttrs);

  return tr;
}

/**
 * Update multiple blocks' attributes in a single transaction
 *
 * @param tr - ProseMirror transaction
 * @param updates - Array of {blockPos, attrs} pairs
 * @returns Modified transaction
 *
 * @example
 * ```ts
 * updateMultipleBlockAttrs(tr, [
 *   { blockPos: 10, attrs: { indent: 1 } },
 *   { blockPos: 20, attrs: { indent: 2 } },
 * ]);
 * ```
 */
export function updateMultipleBlockAttrs(
  tr: Transaction,
  updates: Array<{ blockPos: number; attrs: UpdatableBlockAttrs }>
): Transaction {
  for (const { blockPos, attrs } of updates) {
    updateBlockAttrs(tr, blockPos, attrs);
  }
  return tr;
}

/**
 * Get current block attributes safely
 *
 * @param tr - ProseMirror transaction
 * @param blockPos - Position of the block node
 * @returns Block attributes or null if not found
 */
export function getBlockAttrs(
  tr: Transaction,
  blockPos: number
): Record<string, any> | null {
  const node = tr.doc.nodeAt(blockPos);
  if (!node) return null;
  return node.attrs;
}

/**
 * Validation helper: Check if a node can have a specific attribute
 *
 * @param node - ProseMirror node
 * @param attrName - Attribute name to check
 * @returns true if the node type supports this attribute
 */
export function nodeSupportsAttr(node: PMNode, attrName: string): boolean {
  const nodeType = node.type;
  const attrSpec = nodeType.spec.attrs;
  if (!attrSpec) return false;
  return attrName in attrSpec;
}
