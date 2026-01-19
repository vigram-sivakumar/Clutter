/**
 * Block replacement utility
 * Handles replacing blocks in the editor with cursor position preservation
 */

import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

export interface ReplaceBlockOptions {
  /** Cursor offset from block start (for cursor position preservation) */
  cursorOffset?: number;
}

/**
 * Replace a block range with a new block node
 *
 * @param view - Editor view
 * @param from - Start position of block to replace
 * @param to - End position of block to replace
 * @param replacement - New block node to insert
 * @param options - Optional cursor positioning
 */
export function replaceBlock(
  view: EditorView,
  from: number,
  to: number,
  replacement: PMNode,
  options: ReplaceBlockOptions = {}
): void {
  const { cursorOffset } = options;
  const { state, dispatch } = view;

  // Create transaction to replace the block
  let tr = state.tr.replaceWith(from, to, replacement);

  // If cursorOffset specified, position cursor relative to block start
  if (cursorOffset !== undefined) {
    const newPos = from + cursorOffset;
    // Ensure position is valid within the new block
    const maxPos = from + replacement.nodeSize;
    const safePos = Math.min(Math.max(from, newPos), maxPos - 1);
    tr = tr.setSelection(
      state.selection.constructor.near(tr.doc.resolve(safePos))
    );
  }

  dispatch(tr);
}
