/**
 * Backspace Keymap - Pure ProseMirror backspace behavior
 *
 * Direct ProseMirror transaction dispatch (no intents, no resolver, no engine)
 * - Backspace at start of indented block reduces indent
 * - Otherwise, fallback to default ProseMirror behavior
 */

import type { Editor } from '@tiptap/core';

/**
 * Dispatch a transaction from keyboard handler
 * User edits are automatically tracked via TipTap's addToHistory mechanism
 */
function dispatchUserEdit(view: any, tr: any): void {
  view.dispatch(tr);
}

/**
 * Handle Backspace key - outdent if at start of indented block
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

    dispatchUserEdit(view, tr);
    return true; // Consumed - don't delete
  }

  // Not at start or no indent - let default backspace behavior handle it
  return false;
}
