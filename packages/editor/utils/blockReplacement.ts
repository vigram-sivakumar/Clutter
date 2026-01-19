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

  // Always set selection to maintain ProseMirror invariant:
  // doc-changing transactions must set a valid selection
  if (cursorOffset !== undefined) {
    // Use specified offset
    const newPos = from + cursorOffset;
    // Ensure position is valid within the new block
    const maxPos = from + replacement.nodeSize;
    const safePos = Math.min(Math.max(from, newPos), maxPos - 1);
    tr = tr.setSelection(
      state.selection.constructor.near(tr.doc.resolve(safePos))
    );
  } else {
    // Default: Position cursor at start of new block content (after opening tag)
    // This is correct for markdown shortcuts (e.g., # → heading, cursor ready to type)
    const defaultPos = from + 1;
    tr = tr.setSelection(
      state.selection.constructor.near(tr.doc.resolve(defaultPos))
    );
  }

  dispatch(tr);
}
