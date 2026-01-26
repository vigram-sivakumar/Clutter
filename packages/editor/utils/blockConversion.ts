/**
 * Block Conversion Utility
 *
 * Provides ID-based block conversion for UI contexts where cursor position
 * is not relevant (block menu, context menu, etc.)
 *
 * This is separate from slash commands, which are selection-based.
 *
 * Architecture:
 * - Slash commands → selection-based intent (convert block at cursor)
 * - Block menu → block-identity-based intent (convert specific block by ID)
 */

import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { createBlockNode } from '../domain/createBlock';

/**
 * Type-safe block conversion specification
 * Uses discriminated unions to ensure only valid attribute combinations
 */
export type BlockConversionSpec =
  | { type: 'paragraph' }
  | { type: 'heading'; headingLevel: 1 | 2 | 3 }
  | { type: 'blockquote' }
  | { type: 'listBlock'; listType: 'bullet' | 'numbered' | 'task' | 'toggle' }
  | { type: 'callout'; calloutType: 'info' | 'warning' | 'error' | 'success' }
  | { type: 'codeBlock'; language?: string };

/**
 * Convert a block by its blockId
 *
 * This function:
 * 1. Finds the block by its blockId attribute
 * 2. Creates a replacement node with the target type
 * 3. Preserves content and structural attributes (indent)
 * 4. Dispatches the replacement transaction
 *
 * @param editor - TipTap editor instance
 * @param blockId - Unique identifier of the block to convert
 * @param spec - Type-safe conversion specification
 *
 * @example
 * ```ts
 * // Convert to heading 2
 * convertBlock(editor, 'block-123', { type: 'heading', headingLevel: 2 });
 *
 * // Convert to bullet list
 * convertBlock(editor, 'block-456', { type: 'listBlock', listType: 'bullet' });
 * ```
 */
export function convertBlock(
  editor: Editor,
  blockId: string,
  spec: BlockConversionSpec
): void {
  const { state, view } = editor;
  let blockPos: number | null = null;
  let blockNode: ProseMirrorNode | null = null;

  // Find the block by ID
  state.doc.descendants((node, pos) => {
    if (node.attrs?.blockId === blockId) {
      blockPos = pos;
      blockNode = node;
      return false; // Stop descending into children (optimization)
    }
  });

  if (blockPos === null || !blockNode) {
    console.warn(`[convertBlock] Block not found: ${blockId}`);
    return;
  }

  // Build type-specific attributes
  const typeAttrs = buildTypeAttrs(spec);

  // Get the target node type
  const targetType = state.schema.nodes[spec.type];
  if (!targetType) {
    console.warn(`[convertBlock] Unknown block type: ${spec.type}`);
    return;
  }

  // Preserve block identity and timestamps during conversion
  const preservedAttrs = {
    blockId: blockNode.attrs.blockId, // Preserve block identity
    createdAt: blockNode.attrs.createdAt, // Preserve creation timestamp
    indent: blockNode.attrs.indent ?? 0, // Preserve indent
    collapsed: blockNode.attrs.collapsed ?? false, // Preserve collapsed state
    ...typeAttrs, // Add type-specific attributes
  };

  // Create replacement node with preserved attributes
  const newNode = targetType.create(preservedAttrs, blockNode.content);

  // Replace the block in one transaction
  const tr = state.tr.replaceWith(blockPos, blockPos + blockNode.nodeSize, newNode);
  
  // CRITICAL: Set selection after document change (ProseMirror invariant)
  // Place cursor at the end of the block's content
  const endPos = blockPos + newNode.nodeSize - 1;
  tr.setSelection(TextSelection.near(tr.doc.resolve(endPos)));
  
  view.dispatch(tr);
}

/**
 * Build type-specific attributes from spec
 * Helper to keep convertBlock clean
 */
function buildTypeAttrs(spec: BlockConversionSpec): Record<string, any> {
  switch (spec.type) {
    case 'heading':
      return { headingLevel: spec.headingLevel };
    case 'listBlock':
      return {
        listType: spec.listType,
        checked: spec.listType === 'task' ? false : null,
      };
    case 'callout':
      return { type: spec.calloutType };
    case 'codeBlock':
      return spec.language ? { language: spec.language } : {};
    case 'paragraph':
    case 'blockquote':
      return {};
  }
}
