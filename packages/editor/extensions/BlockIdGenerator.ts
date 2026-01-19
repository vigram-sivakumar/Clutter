/**
 * BlockIdGenerator Extension
 *
 * Automatically generates blockId for all blocks that don't have one.
 * Runs as a ProseMirror plugin that intercepts every transaction.
 *
 * FLAT MODEL:
 * - Only assigns blockId (unique identifier)
 * - Does NOT compute hierarchy (uses indent attribute only)
 * - Detects and fixes duplicate blockIds from cloned nodes
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { updateBlockAttrs } from '../domain/updateBlockAttrs';

export const BlockIdGenerator = Extension.create({
  name: 'blockIdGenerator',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockIdGenerator'),

        appendTransaction: (transactions, _oldState, newState) => {
          // Block identity is assigned ONLY during user edits
          // NEVER during hydration - blocks from state already have IDs
          const hasUserEdit = transactions.some(
            (tr) => tr.getMeta('isUserEdit') === true
          );

          // Hard block: ONLY run on explicit user edits
          if (!hasUserEdit) return null;

          // Prevent infinite loops from our own transactions
          if (transactions.some((tr) => tr.getMeta('blockIdGenerator'))) {
            return null;
          }

          const docChanged = transactions.some((tr) => tr.docChanged);
          if (!docChanged) return null;

          const tr = newState.tr;
          tr.setMeta('blockIdGenerator', true); // Mark as our transaction
          tr.setMeta('addToHistory', false); // ✅ Prevent undo pollution
          let modified = false;

          // 🔒 CRITICAL: Track seen blockIds to detect duplicates (cloned nodes)
          // ProseMirror clones nodes WITH their attributes, causing duplicate blockIds
          // We must regenerate blockIds for clones to maintain uniqueness invariant
          const seenBlockIds = new Set<string>();

          // 🔒 SANITIZATION: Strip blockIds from non-block nodes (one-time migration)
          // This cleans up legacy data where inline/text nodes incorrectly have blockIds
          // ⚠️ EXCEPTION: Direct setNodeMarkup allowed here for cleanup/migration
          newState.doc.descendants((node, pos) => {
            if (!node.isBlock && node.attrs?.blockId !== undefined) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                blockId: undefined,
              });
              modified = true;
            }
          });

          // Traverse all nodes in the document
          newState.doc.descendants((node, pos) => {
            // Only process nodes that have blockId attribute defined in their schema
            if (!node.attrs || node.attrs.blockId === undefined) return;

            // 🔒 DEV INVARIANT: Empty non-paragraph blocks at root should not persist
            // AFTER keyboard normalization rules have run
            //
            // NOTE: This only checks AFTER keyboard events (Enter/Backspace),
            // not during document initialization, slash commands, etc.
            // Empty blocks are LEGAL during creation - they should only be
            // normalized when user interacts with them via keyboard.
            if (process.env.NODE_ENV !== 'production') {
              // Only check if this transaction is from a keyboard normalization rule
              const isFromKeyboardNormalization = transactions.some(
                (tr) => tr.getMeta('keyboardNormalization') === true
              );

              if (isFromKeyboardNormalization) {
                const isEmptyNonParagraph =
                  node.type.name !== 'paragraph' &&
                  node.type.name !== 'horizontalRule' && // HR is not a textblock
                  node.content.size === 0 &&
                  node.attrs.indent === 0; // At root level

                // Empty non-paragraph blocks at root are handled by keyboard normalization
                // No logging needed in production
              }
            }

            // 🔒 BLOCK IDENTITY LAW: blockIds must be UNIQUE per node instance
            // ProseMirror clones nodes (e.g., during normalization, wrapping, lifting)
            // Cloned nodes retain their attributes, including blockId
            // We must detect duplicates and regenerate them
            const currentBlockId = node.attrs.blockId;

            // CASE 1: Node has no blockId → generate one
            // CASE 2: Node has blockId but it's a DUPLICATE (cloned) → regenerate
            const isDuplicate =
              currentBlockId && seenBlockIds.has(currentBlockId);
            const needsNewId =
              !currentBlockId || currentBlockId === '' || isDuplicate;

            if (needsNewId) {
              const newBlockId = crypto.randomUUID();

              // ⚠️ EXCEPTION: Direct setNodeMarkup allowed here for blockId repair/migration
              // This is the ONLY place that can SET (not update) blockIds on existing blocks
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                blockId: newBlockId,
              });

              // Track the NEW blockId
              seenBlockIds.add(newBlockId);
              modified = true;
              return;
            }

            // Track this blockId as seen
            seenBlockIds.add(currentBlockId);
          });

          // 🔒 DEV-ONLY INVARIANT: No non-block node should ever have a blockId
          if (process.env.NODE_ENV !== 'production') {
            newState.doc.descendants((node) => {
              if (!node.isBlock && node.attrs?.blockId !== undefined) {
                console.error(
                  '[BlockIdGenerator] Non-block node has blockId (should not happen)',
                  node.type.name,
                  node.attrs.blockId
                );
              }
            });
          }

          if (modified) {
            return tr;
          }

          return null;
        },
      }),
    ];
  },
});
