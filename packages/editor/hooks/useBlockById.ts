/**
 * useBlockById - Find a block by its blockId attribute
 *
 * This hook provides a consistent way to locate blocks in the ProseMirror document
 * by their blockId. It's used throughout the chrome layer for block operations.
 *
 * Why this exists:
 * - Eliminates repetitive descendant traversal code
 * - Provides consistent error handling
 * - Single source of truth for block lookup logic
 */

import { useCallback } from 'react';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export interface BlockLookupResult {
  pos: number;
  node: ProseMirrorNode;
}

/**
 * Hook to find a block by its blockId
 *
 * @param editor - TipTap editor instance
 * @returns Function that finds a block by ID and returns position + node
 *
 * @example
 * ```ts
 * const findBlock = useBlockById(editor);
 * const result = findBlock('block-123');
 * if (result) {
 *   const { pos, node } = result;
 *   // Use pos and node for operations
 * }
 * ```
 */
export function useBlockById(editor: Editor) {
  return useCallback(
    (blockId: string): BlockLookupResult | null => {
      const { state } = editor;
      let blockPos: number | null = null;
      let blockNode: ProseMirrorNode | null = null;

      state.doc.descendants((node, pos) => {
        if (node.attrs?.blockId === blockId) {
          blockPos = pos;
          blockNode = node;
          return false; // Stop traversing
        }
      });

      if (blockPos === null || blockNode === null) {
        return null;
      }

      return { pos: blockPos, node: blockNode };
    },
    [editor]
  );
}
