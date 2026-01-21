/**
 * Backspace Keymap - Pure ProseMirror backspace behavior
 *
 * Direct ProseMirror transaction dispatch (no intents, no resolver, no engine)
 * - Backspace at start of indented block reduces indent
 * - Otherwise, fallback to default ProseMirror behavior
 */

import type { Editor } from '@tiptap/core';
import { outdentBlock } from '../../../domain/indentOperations';

/**
 * Dispatch a transaction from keyboard handler
 * User edits are automatically tracked via TipTap's addToHistory mechanism
 */
function dispatchUserEdit(view: any, tr: any): void {
  view.dispatch(tr);
}

/**
 * Handle Backspace key - outdent if at start of indented block, or join with previous block
 *
 * @param editor - TipTap editor instance
 * @returns true if handled (key consumed), false if should fallback to default behavior
 */
export function handleBackspace(editor: Editor): boolean {
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
    tr.setSelection(state.selection); // 🔒 CRITICAL: Preserve selection after attribute change

    dispatchUserEdit(view, tr);
    return true; // Consumed - don't delete
  }

  // 🔒 CRITICAL FIX: Explicitly handle empty root-level block deletion
  // When at start of block with indent 0, check if we should join with previous block
  // We can't delegate to default PM behavior because it doesn't preserve selection correctly
  const blockPos = $from.before();
  const blockIndex = $from.index($from.depth - 1);

  // If this is the first block, don't delete it (always keep at least one block)
  if (blockIndex === 0) {
    return true; // Consume the key but don't do anything
  }

  // Check if current block is empty
  const isEmpty = node.content.size === 0;

  if (isEmpty) {
    // Delete the empty block and move cursor to end of previous block
    const tr = state.tr;
    const prevBlock = $from.node($from.depth - 1).child(blockIndex - 1);
    const prevBlockEnd = $from.before() - 1; // Position at end of previous block

    // Delete this empty block
    tr.delete(blockPos, blockPos + node.nodeSize);

    // 🔒 CRITICAL: Set selection to end of previous block
    tr.setSelection(
      state.selection.constructor.near(tr.doc.resolve(prevBlockEnd))
    );

    dispatchUserEdit(view, tr);
    return true;
  }

  // Block not empty - let default behavior handle joining content
  return false;
}
