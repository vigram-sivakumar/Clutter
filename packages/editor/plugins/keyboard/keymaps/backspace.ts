/**
 * Backspace Keymap - Pure ProseMirror backspace behavior
 *
 * Direct ProseMirror transaction dispatch (no intents, no resolver, no engine)
 * - Backspace at start of indented block reduces indent
 * - Otherwise, fallback to default ProseMirror behavior
 */

import type { Editor } from '@tiptap/core';
import { TextSelection } from 'prosemirror-state';
import { outdentBlock } from '../../../domain/indentOperations';
import { withUISafety } from '../withUISafety';

/**
 * Dispatch a transaction from keyboard handler
 * User edits are automatically tracked via TipTap's addToHistory mechanism
 */
function dispatchUserEdit(view: any, tr: any): void {
  view.dispatch(tr);
}

/**
 * Get end position of a block and its visual subtree
 *
 * @param state - ProseMirror state
 * @param blockPos - Position before the parent block
 * @param blockIndent - Indent level of the parent block
 * @returns Position after the last descendant
 */
function getSubtreeEndPosition(
  state: Editor['state'],
  blockPos: number,
  blockIndent: number
): number {
  const doc = state.doc;
  let pos = blockPos;

  const blockNode = doc.nodeAt(blockPos);
  if (!blockNode) return blockPos + 1;

  // Start after the parent block
  pos = blockPos + blockNode.nodeSize;

  // Walk forward through document
  while (pos < doc.nodeSize - 2) {
    const resolved = doc.resolve(pos);
    const nextNode = resolved.nodeAfter;
    if (!nextNode) break;

    const nextIndent = nextNode.attrs?.indent ?? 0;

    // Stop if next block is at same level or lower (not a child)
    if (nextIndent <= blockIndent) break;

    // Skip this child and continue
    pos += nextNode.nodeSize;
  }

  return pos;
}

/**
 * Handle Backspace key - implementation
 * (Wrapped with withUISafety for automatic UI intent handling)
 *
 * @param editor - TipTap editor instance
 * @returns true if handled (key consumed), false if should fallback to default behavior
 */
function handleBackspaceImpl(editor: Editor): boolean {
  const { state, view } = editor;
  const { $from, empty } = state.selection;

  // Only handle if selection is empty (cursor) and at start of block
  if (!empty || $from.parentOffset !== 0) {
    return false;
  }

  // Get the parent block node
  const node = $from.parent;
  if (!node || !node.attrs) return false;

  // If block has indent, reduce it
  const currentIndent = node.attrs.indent ?? 0;
  if (currentIndent > 0) {
    const tr = state.tr;
    outdentBlock(tr, $from.before());

    // 🔒 GOLDEN RULE: After outdentBlock(), map the position and use near()
    // outdentBlock mutates attributes, requiring selection to be mapped to new document
    // Use TextSelection.near() for safety - guarantees valid text position
    const mappedPos = tr.mapping.map($from.pos);
    tr.setSelection(TextSelection.near(tr.doc.resolve(mappedPos), 1));

    dispatchUserEdit(view, tr);
    return true; // Consumed - don't delete
  }

  // 🔒 CRITICAL FIX: Explicitly handle empty root-level block deletion
  // When at start of block with indent 0, check if we should join with previous block
  // We can't delegate to default PM behavior because it doesn't preserve selection correctly
  const blockPos = $from.before();
  const doc = state.doc;

  // Check if current block is empty
  const isEmpty = node.content.size === 0;
  const nodeType = node.type.name;

  if (isEmpty) {
    // 🔄 EMPTY NON-PARAGRAPH AT ROOT → CONVERT TO PARAGRAPH FIRST
    // This matches Notion's behavior: first backspace converts, second backspace deletes
    if (currentIndent === 0 && nodeType !== 'paragraph') {
      const tr = state.tr;

      // Preserve only blockId and indent, reset everything else
      const cleanAttrs = {
        blockId: node.attrs.blockId,
        indent: 0,
      };

      // Convert to paragraph
      tr.setNodeMarkup(blockPos, state.schema.nodes.paragraph, cleanAttrs);

      // 🔒 GOLDEN RULE: After setNodeMarkup(), map the position and use near()
      // setNodeMarkup mutates the document, so old positions must be mapped
      // Use TextSelection.near() for safety - guarantees valid text position after structural change
      const newPos = tr.mapping.map($from.pos);
      tr.setSelection(TextSelection.near(tr.doc.resolve(newPos), 1));

      dispatchUserEdit(view, tr);
      return true;
    }

    // 🗑️ EMPTY PARAGRAPH AT ROOT → DELETE AND JOIN WITH PREVIOUS
    // Only delete if it's already a paragraph (after conversion above)
    // UNLESS it's the first block (always keep at least one block)
    if (nodeType === 'paragraph') {
      // 🔍 Find previous block using traversal (container-safe)
      let prevBlockPos: number | null = null;
      let prevBlockIndent = 0;

      // Traverse all blocks to find the one immediately before current
      doc.descendants((n, p) => {
        if (!n.attrs?.blockId) return true; // Skip non-blocks

        if (p === blockPos) {
          // Found current block, stop
          return false;
        }

        // This is a previous block, remember it
        prevBlockPos = p;
        prevBlockIndent = n.attrs.indent ?? 0;
        return true;
      });

      // If no previous block exists, this is the first block
      if (prevBlockPos === null) {
        // First block: let default PM behavior handle text deletion
        // 🔒 GOLDEN RULE: Only return true if you dispatch a transaction
        return false;
      }

      // Delete empty paragraph and move to end of previous block (including its subtree)
      const tr = state.tr;

      // Calculate end of previous block's subtree
      const prevBlockEnd = getSubtreeEndPosition(
        state,
        prevBlockPos,
        prevBlockIndent
      );

      // Delete this empty block
      tr.delete(blockPos, blockPos + node.nodeSize);

      // 🔒 GOLDEN RULE: After delete(), map the position
      // prevBlockEnd was computed before delete, so it must be mapped to new document
      const targetPos = tr.mapping.map(prevBlockEnd - 1);
      const safePos = Math.min(targetPos, tr.doc.content.size - 1);
      tr.setSelection(TextSelection.near(tr.doc.resolve(safePos)));

      dispatchUserEdit(view, tr);
      return true;
    }
  }

  // Block not empty - let default behavior handle joining content
  return false;
}

/**
 * Handle Backspace key
 *
 * 🔒 WRAPPED WITH UI SAFETY:
 * - Automatically defers to UI handlers (slash commands, mentions, etc.)
 * - Returns false when UI is active, true when structural edit applied
 * - See withUISafety wrapper for enforcement details
 */
export const handleBackspace = withUISafety(
  handleBackspaceImpl,
  'handleBackspace'
);
