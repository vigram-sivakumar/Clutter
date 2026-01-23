/**
 * BlockTimestampTracker Extension
 *
 * Automatically updates `updatedAt` timestamp when a block's content changes.
 * Runs as a ProseMirror plugin that intercepts every transaction.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const BlockTimestampTracker = Extension.create({
  name: 'blockTimestampTracker',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockTimestampTracker'),

        appendTransaction: (transactions, _oldState, newState) => {
          // Only run on user edits (not system transactions)
          const hasUserEdit = transactions.some(
            (tr) => tr.getMeta('addToHistory') !== false && tr.docChanged
          );

          if (!hasUserEdit) return null;

          // Prevent infinite loops from our own transactions
          if (transactions.some((tr) => tr.getMeta('blockTimestampTracker'))) {
            return null;
          }

          const tr = newState.tr;
          tr.setMeta('blockTimestampTracker', true);
          tr.setMeta('addToHistory', false); // Don't pollute undo history
          let modified = false;

          const now = new Date().toISOString();

          // Find which blocks were modified in this transaction
          const modifiedBlocks = new Set<number>();

          transactions.forEach((transaction) => {
            transaction.steps.forEach((step: any) => {
              // Track positions affected by the step
              const from = step.from;
              const to = step.to || from;

              // Find all blocks in the affected range
              newState.doc.nodesBetween(from, to, (node, pos) => {
                if (node.isBlock && node.attrs?.blockId) {
                  modifiedBlocks.add(pos);
                }
              });
            });
          });

          // Update timestamps for modified blocks
          modifiedBlocks.forEach((pos) => {
            const node = newState.doc.nodeAt(pos);
            if (!node || !node.attrs?.blockId) return;

            // Update the updatedAt timestamp
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              updatedAt: now,
            });
            modified = true;
          });

          return modified ? tr : null;
        },
      }),
    ];
  },
});
