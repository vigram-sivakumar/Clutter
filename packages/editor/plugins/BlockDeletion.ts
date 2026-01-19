/**
 * Block Deletion Plugin
 *
 * Handles multi-block deletion for keyboard shortcuts (Delete/Backspace).
 * Delegates to TipTap's built-in deletion for single blocks.
 */

import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import {
  isMultiBlockSelection,
  getSelectedBlocks,
} from '../utils/multiSelection';

const blockDeletionPluginKey = new PluginKey('blockDeletion');

export const BlockDeletion = Extension.create({
  name: 'blockDeletion',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: blockDeletionPluginKey,
        props: {
          handleKeyDown(view, event) {
            // Only handle Delete and Backspace keys
            if (event.key !== 'Delete' && event.key !== 'Backspace') {
              return false;
            }

            const editor = (this as { editor?: Editor }).editor;
            if (!editor) {
              return false;
            }

            // Case 1: Multi-block selection (Shift+Click, Cmd+A)
            const isMultiBlock = isMultiBlockSelection(editor);
            if (isMultiBlock) {
              const blocks = getSelectedBlocks(editor);
              if (blocks && blocks.length > 1) {
                // Delete all selected blocks using TipTap commands
                event.preventDefault();
                editor.commands.deleteSelection();
                return true;
              }
            }

            // Case 2: Single block selection → delegate to default handlers
            return false;
          },
        },
      }),
    ];
  },
});
