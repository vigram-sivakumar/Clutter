/**
 * UserInputMarker Plugin
 *
 * Marks ONLY direct user input transactions with isUserEdit meta.
 *
 * Marks:
 * - Typing (filterTransaction catches input events)
 * - Keyboard shortcuts (already marked by handlers)
 *
 * Does NOT mark:
 * - Hydration (isHydrating meta)
 * - setContent operations
 * - Plugin mutations (blockIdGenerator, etc.)
 * - Any transaction from code
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const UserInputMarker = Extension.create({
  name: 'userInputMarker',

  priority: 10000, // Run before all other plugins

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('userInputMarker'),

        appendTransaction: (transactions, _oldState, newState) => {
          // Log all transactions for debugging
          if (transactions.some((tr) => tr.docChanged)) {
            console.log('📋 [UserInputMarker] Transaction detected', {
              count: transactions.length,
              docChanged: transactions.filter((tr) => tr.docChanged).length,
              steps: transactions.map((tr) => tr.steps.length),
            });
          }

          // Already marked - pass through
          if (transactions.some((tr) => tr.getMeta('isUserEdit') === true)) {
            return null;
          }

          // Check if ANY transaction should be marked as user input
          const shouldMark = transactions.some((tr) => {
            // Must change document
            if (!tr.docChanged) return false;

            // NEVER mark these (opt-out list)
            if (tr.getMeta('isHydrating') === true) return false;
            if (tr.getMeta('blockIdGenerator') === true) return false;
            if (tr.getMeta('userInputMarker') === true) return false;
            if (tr.getMeta('addToHistory') === false) return false;

            // Everything else that changes the doc is user input
            return true;
          });

          if (!shouldMark) return null;

          // Mark this batch as user edit
          const tr = newState.tr;
          tr.setMeta('isUserEdit', true);
          tr.setMeta('userInputMarker', true);
          return tr;
        },
      }),
    ];
  },
});
