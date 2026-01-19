/**
 * Keyboard Helpers - Utility functions for keyboard handling
 *
 * This file contains shared utilities used by keyboard-related code.
 * Most keyboard behavior is now handled by keymaps in plugins/keyboard/keymaps/.
 */

import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';

/**
 * Find an ancestor node by name
 *
 * Walks up the document tree from the current selection position
 * to find the nearest ancestor node matching the given type(s).
 *
 * @param editor - TipTap editor instance
 * @param nodeName - Node type name(s) to search for (string or array)
 * @returns Object with pos, node, and depth if found, null otherwise
 *
 * @example
 * // Find nearest listBlock ancestor
 * const listBlock = findAncestorNode(editor, 'listBlock');
 *
 * @example
 * // Find nearest wrapper (blockquote or callout)
 * const wrapper = findAncestorNode(editor, ['blockquote', 'callout']);
 */
export function findAncestorNode(
  editor: Editor,
  nodeName: string | string[]
): { pos: number; node: PMNode; depth: number } | null {
  const { state } = editor;
  const { $from } = state.selection;
  const names = Array.isArray(nodeName) ? nodeName : [nodeName];

  for (let d = $from.depth; d >= 1; d--) {
    const pos = $from.before(d);
    const node = state.doc.nodeAt(pos);
    if (node && names.includes(node.type.name)) {
      return { pos, node, depth: d };
    }
  }
  return null;
}
