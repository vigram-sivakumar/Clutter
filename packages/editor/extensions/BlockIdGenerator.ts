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

export const BlockIdGenerator = Extension.create({
  name: 'blockIdGenerator',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockIdGenerator'),

        appendTransaction: (transactions, _oldState, newState) => {
          // Block identity is assigned ONLY during user edits
          // NEVER during hydration - blocks from state already have IDs
          // Use TipTap's standard addToHistory mechanism to detect user edits
          const hasUserEdit = transactions.some(
            (tr) => tr.getMeta('addToHistory') !== false && tr.docChanged
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

          // 🔒 SINGLE-PASS TRAVERSAL: Sanitize non-block nodes AND assign/repair blockIds
          // Combined into one pass to avoid position invalidation bugs
          // ⚠️ EXCEPTION: Direct setNodeMarkup allowed here for cleanup/migration/blockId repair
          newState.doc.descendants((node, pos) => {
            // SANITIZATION: Strip blockIds from non-block nodes (one-time migration)
            // This cleans up legacy data where inline/text nodes incorrectly have blockIds
            if (!node.isBlock && node.attrs?.blockId !== undefined) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                blockId: undefined,
              });
              modified = true;
              return; // Skip further processing for non-block nodes
            }

            // Only process block nodes that have blockId attribute defined in their schema
            if (!node.attrs || node.attrs.blockId === undefined) return;

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
              // 🔒 FIX: Track the old duplicate blockId BEFORE regenerating
              // This ensures subsequent nodes with the same old ID are also detected as duplicates
              if (isDuplicate && currentBlockId) {
                seenBlockIds.add(currentBlockId);
              }

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
          // This validates the post-mutation document to catch any violations
          if (process.env.NODE_ENV !== 'production') {
            tr.doc.descendants((node) => {
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
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // 🔒 PROSEMIRROR INVARIANT: Selection Preservation
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            //
            // This hook only adds metadata (blockId attributes).
            // It does NOT intend to change cursor position.
            //
            // Therefore: MUST preserve the selection that was already
            // correctly set by the original transaction (e.g., Enter handler).
            //
            // Rule: If appendTransaction modifies the document, it MUST
            // explicitly set selection (either preserve or intentionally move).
            //
            // Failure to preserve causes:
            // - Cursor staying in wrong block after Enter
            // - "INVALID TRANSACTION" diagnostic errors
            // - Non-deterministic selection bugs
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            tr.setSelection(newState.selection);
            return tr;
          }

          return null;
        },
      }),
    ];
  },
});
