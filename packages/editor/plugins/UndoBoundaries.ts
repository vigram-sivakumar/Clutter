/**
 * UndoBoundaries Extension
 * Creates undo/redo boundaries on specific events for granular undo behavior (like Notion)
 *
 * Key feature: Forces each block creation/deletion to be a separate undo step
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const UndoBoundaries = Extension.create({
  name: 'undoBoundaries',

  addProseMirrorPlugins() {
    let lastDocSize = 0;
    let _lastBlockCount = 0;

    return [
      new Plugin({
        key: new PluginKey('undoBoundaries'),

        appendTransaction(transactions, oldState, newState) {
          // Check if document structure changed (blocks added/removed)
          const oldDocSize = oldState.doc.content.size;
          const newDocSize = newState.doc.content.size;
          const oldChildCount = oldState.doc.content.childCount;
          const newChildCount = newState.doc.content.childCount;

          // If block count changed (new paragraph, list item, etc.)
          if (oldChildCount !== newChildCount) {
            // Force history boundary by returning a transaction marked with closeHistory
            const tr = newState.tr;
            tr.setMeta('addToHistory', false);
            tr.setMeta('closeHistoryGroup', true);
            // 🔒 Preserve selection (annotation pattern - only adding metadata)
            tr.setSelection(newState.selection);
            _lastBlockCount = newChildCount;
            return tr;
          }

          // If document size changed significantly (indicating structural change)
          if (
            Math.abs(newDocSize - oldDocSize) > 50 &&
            newDocSize !== lastDocSize
          ) {
            const tr = newState.tr;
            tr.setMeta('addToHistory', false);
            tr.setMeta('closeHistoryGroup', true);
            // 🔒 Preserve selection (annotation pattern - only adding metadata)
            tr.setSelection(newState.selection);
            lastDocSize = newDocSize;
            return tr;
          }

          return null;
        },

        props: {
          handleTextInput(view, from, to, text) {
            // Create undo boundary on space (word boundary)
            if (text === ' ') {
              const { state, dispatch } = view;
              const tr = state.tr;
              tr.setMeta('addToHistory', false);
              tr.setMeta('closeHistoryGroup', true);
              dispatch(tr);
            }
            return false; // Let default text input handler run
          },
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      // NO keyboard shortcuts here - let appendTransaction handle it
      // This ensures we don't interfere with other extensions' Enter handlers
    };
  },
});
