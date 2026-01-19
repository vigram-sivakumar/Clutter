/**
 * Backspace Keymap - Pure ProseMirror backspace behavior
 *
 * Direct ProseMirror transaction dispatch (no intents, no resolver, no engine)
 * - Backspace at start of indented block reduces indent
 * - Otherwise, fallback to default ProseMirror behavior
 */

import type { Editor } from '@tiptap/core';

/**
 * Dispatch a transaction marked as user edit
 */
function dispatchUserEdit(view: any, tr: any): void {
  tr.setMeta('isUserEdit', true);
  view.dispatch(tr);
}

/**
 * Handle Backspace key - outdent if at start of indented block
 *
 * @param editor - TipTap editor instance
 * @returns true if handled (key consumed), false if should fallback to default behavior
 */
export function handleBackspace(editor: Editor): boolean {
  console.log('🔑 [handleBackspace] Function called');

  const { state, view } = editor;
  const { $from, empty } = state.selection;

  console.log('🔑 [handleBackspace] Selection state', {
    empty,
    parentOffset: $from.parentOffset,
    nodeType: $from.parent.type.name,
    indent: $from.parent.attrs?.indent,
  });

  // Only handle if selection is empty (cursor) and at start of block
  if (!empty || $from.parentOffset !== 0) {
    console.log(
      '🔑 [handleBackspace] Not at block start, returning false (allow default)'
    );
    return false;
  }

  // Get the parent block node
  const node = $from.parent;
  if (!node || !node.attrs) return false;

  // If block has indent, reduce it
  const currentIndent = node.attrs.indent ?? 0;
  if (currentIndent > 0) {
    const tr = state.tr.setNodeMarkup($from.before(), undefined, {
      ...node.attrs,
      indent: currentIndent - 1,
    });

    dispatchUserEdit(view, tr);
    return true; // Consumed - don't delete
  }

  // Not at start or no indent - let default backspace behavior handle it
  return false;
}
