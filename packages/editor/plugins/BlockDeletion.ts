/**
 * Block Deletion Plugin
 *
 * Handles multi-block deletion for keyboard shortcuts (Delete/Backspace).
 * Delegates to TipTap's built-in deletion for single blocks.
 */

import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import {
  isMultiBlockSelection,
  getSelectedBlocks,
} from '../utils/multiSelection';

const blockDeletionPluginKey = new PluginKey('blockDeletion');

export const BlockDeletion = Extension.create({
  name: 'blockDeletion',

  addProseMirrorPlugins() {
    const editor = this.editor; // Capture editor in closure

    return [
      new Plugin({
        key: blockDeletionPluginKey,
        props: {
          handleKeyDown(view, event) {
            // Only handle Delete and Backspace keys
            if (event.key !== 'Delete' && event.key !== 'Backspace') {
              return false;
            }

            if (!editor) {
              return false;
            }

            // Case 1: Multi-block selection (Shift+Click, Cmd+A, AllSelection)
            const isMultiBlock = isMultiBlockSelection(editor);
            if (isMultiBlock) {
              const blocks = getSelectedBlocks(editor);
              if (blocks && blocks.length > 0) {
                event.preventDefault();

                const { state } = view;
                let tr = state.tr;

                // Remember the position of the first block
                const firstBlockPos = blocks[0]?.pos ?? 0;

                // Check if we're deleting all blocks
                const deletingAllBlocks =
                  blocks.length === state.doc.childCount;

                // Delete in reverse order to preserve positions
                for (let i = blocks.length - 1; i >= 0; i--) {
                  const block = blocks[i];
                  if (block) {
                    tr = tr.delete(block.pos, block.pos + block.nodeSize);
                  }
                }

                // If we deleted everything, create an empty paragraph
                if (deletingAllBlocks) {
                  const emptyParagraph = state.schema.nodes.paragraph.create();
                  tr = tr.insert(0, emptyParagraph);
                  // Place cursor inside the new paragraph
                  tr = tr.setSelection(TextSelection.create(tr.doc, 1));
                } else {
                  // Set selection to a safe position after deletion
                  const newPos = Math.min(firstBlockPos, tr.doc.content.size);
                  tr = tr.setSelection(TextSelection.create(tr.doc, newPos));
                }

                view.dispatch(tr);
                return true;
              }
            }

            // Case 2: Single text selection → delegate to default handlers
            return false;
          },
        },
      }),
    ];
  },
});
