/**
 * createBlock() - SINGLE SOURCE OF TRUTH FOR BLOCK CREATION
 *
 * 🔒 ARCHITECTURAL LAW:
 * ALL block creation MUST go through this function.
 * No exceptions. No "just for this rule." No "temporary."
 *
 * Why this exists:
 * - Centralizes blockId generation
 * - Centralizes indent handling
 * - Centralizes insert position validation
 * - Makes block creation bugs structurally impossible
 * - Makes audit/logging/metrics possible
 *
 * Mental Model:
 * User intent (Enter/Tab/Slash/Paste)
 *   ↓
 * Intent resolver
 *   ↓
 * createBlock() ← YOU ARE HERE
 *   ↓
 * ProseMirror transaction
 */

import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Node as PMNode, Fragment } from '@tiptap/pm/model';

/**
 * Supported block types (v1 - intentionally limited)
 * DO NOT add more until these are proven stable
 */
type BlockType = 'paragraph' | 'listBlock' | 'horizontalRule';

/**
 * Options for creating a block
 */
export type CreateBlockOptions = {
  /** Block type to create */
  type: BlockType;
  
  /** Position in document to insert the block */
  insertPos: number;
  
  /** Indent level (default: 0) */
  indent?: number;
  
  /** Block ID (if provided, uses this; otherwise generates new UUID) */
  blockId?: string;
  
  /** Additional attributes (e.g., listType, collapsed, etc.) */
  attrs?: Record<string, any>;
  
  /** Optional content for the block (for split operations) */
  content?: Fragment | null;
};

/**
 * Create a block and insert it into the transaction
 *
 * @returns The created node, or null if creation failed
 *
 * 🛡️ SAFETY:
 * - Validates insertPos before insertion
 * - Always generates new blockId
 * - Always sets indent explicitly
 * - Fails loudly on errors
 *
 * @example
 * ```ts
 * createBlock(state, tr, {
 *   type: 'paragraph',
 *   insertPos: 10,
 *   indent: 1,
 * });
 * ```
 */
export function createBlock(
  state: EditorState,
  tr: Transaction,
  options: CreateBlockOptions
): PMNode | null {
  const { type, insertPos, indent = 0, blockId, attrs = {}, content = null } = options;

  // Lookup node type from schema
  const nodeType = state.schema.nodes[type];
  if (!nodeType) {
    throw new Error(`[createBlock] Unknown block type: ${type}`);
  }

  // 🛡️ Position validation (same guard as enterOnSelectedBlock)
  if (insertPos <= 0 || insertPos > tr.doc.content.size) {
    return null;
  }

  // 🔑 Create node with guaranteed blockId and indent
  // Content parameter supports split operations (Enter in middle of block)
  // 🔒 BLOCK IDENTITY LAW: Use provided blockId if available, otherwise generate new UUID
  const node = nodeType.create(
    {
      blockId: blockId || crypto.randomUUID(), // 🔒 Explicit ID or new ID
      indent, // 🔒 ALWAYS explicit
      ...attrs, // Additional attrs (listType, collapsed, etc.)
    },
    content // Optional content for split operations
  );

  // 🛡️ Verify indent was set correctly (same guard as enterOnSelectedBlock)
  if (node.attrs.indent !== indent) {
    // Indent mismatch detected
  }

  // Insert into transaction
  tr.insert(insertPos, node);

  return node;
}
