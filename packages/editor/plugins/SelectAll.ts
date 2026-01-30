/**
 * Progressive Select All Plugin
 *
 * Implements simplified Cmd+A behavior:
 * 1. First Cmd+A: Select current block (NodeSelection - blue halo)
 * 2. Second Cmd+A: Select all blocks (AllSelection - all blue halos)
 */

import {
  Plugin,
  PluginKey,
  AllSelection,
  NodeSelection,
} from '@tiptap/pm/state';
import { Extension } from '@tiptap/core';

export const SelectAllPluginKey = new PluginKey('selectAll');

/**
 * Check if selection is a NodeSelection on a single block
 */
function isNodeSelected(state: any): boolean {
  const { selection } = state;
  return selection.constructor.name === '_NodeSelection';
}

/**
 * Select the entire current block as a node
 */
function selectCurrentBlockAsNode(state: any, dispatch: any): boolean {
  const { selection, doc } = state;
  const { $from } = selection;

  const blockDepth = $from.depth;
  if (blockDepth === 0) return false;

  // Get the position of the current block
  const blockPos = $from.before(blockDepth);

  // Create NodeSelection
  const tr = state.tr.setSelection(NodeSelection.create(doc, blockPos));
  dispatch(tr);
  return true;
}

/**
 * Select all blocks in the document
 */
function selectAllBlocks(state: any, dispatch: any): boolean {
  const { doc } = state;

  // Use AllSelection for selecting the entire document
  // This is the correct way to select all content - it properly handles
  // document-level selection without creating invalid TextSelection endpoints
  const tr = state.tr.setSelection(new AllSelection(doc));
  dispatch(tr);

  return true;
}

export const SelectAll = Extension.create({
  name: 'selectAll',

  addKeyboardShortcuts() {
    return {
      'Mod-a': ({ editor }) => {
        const { state, view } = editor;
        const { dispatch } = view;

        const nodeSelected = isNodeSelected(state);

        console.log('🔍 Ctrl+A:', {
          nodeSelected,
          selectionType: state.selection.constructor.name,
        });

        // Step 1: If current block is selected as node → select all blocks
        if (nodeSelected) {
          console.log(
            '→ NodeSelection detected, selecting all blocks (AllSelection)'
          );
          return selectAllBlocks(state, dispatch);
        }

        // Step 2: Default - select current block as node (blue halo)
        console.log('→ Selecting current block as NodeSelection (blue halo)');
        return selectCurrentBlockAsNode(state, dispatch);
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: SelectAllPluginKey,
        props: {
          handleKeyDown(_view, _event) {
            // Let the keyboard shortcut handler take care of it
            return false;
          },
        },
      }),
    ];
  },
});
