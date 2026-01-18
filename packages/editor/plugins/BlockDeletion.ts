/**
 * Block Deletion Plugin
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 STRUCTURAL DELETE LAW (ARCHITECTURAL)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This plugin is a PURE DELEGATOR.
 * It does NOT:
 * - Perform deletions
 * - Place cursors
 * - Mutate PM state
 * - Understand structure
 *
 * It ONLY:
 * - Detects delete intent (keyboard, handle)
 * - Delegates to performStructuralDelete()
 *
 * All structural delete logic lives in:
 *   packages/editor/core/structuralDelete/performStructuralDelete.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import {
  isMultiBlockSelection,
  getSelectedBlocks,
} from '../utils/multiSelection';
import { performStructuralDelete } from '../core/structuralDelete/performStructuralDelete';
import type { EditorEngine } from '../core/engine/EditorEngine';

/**
 * Get EditorEngine from TipTap editor instance
 * Engine is attached by EditorCore during initialization
 */
function getEngine(editor: any): EditorEngine | null {
  return editor._engine || null;
}

const blockDeletionPluginKey = new PluginKey('blockDeletion');

export const BlockDeletion = Extension.create({
  name: 'blockDeletion',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: blockDeletionPluginKey,
        props: {
          handleKeyDown(view, event) {
            const { state } = view;
            const { selection } = state;
            const editor = (this as any).editor;

            if (!editor) return false;

            const engine = getEngine(editor);
            if (!engine) return false;

            // Only handle Delete and Backspace keys
            if (event.key !== 'Delete' && event.key !== 'Backspace') {
              return false;
            }

            // Case 1: Multi-block selection (Shift+Click, Cmd+A)
            const isMultiBlock = isMultiBlockSelection(editor);
            if (isMultiBlock) {
              const blocks = getSelectedBlocks(editor);
              if (blocks && blocks.length > 1) {
                event.preventDefault();
                event.stopPropagation();

                

                const blockIds = blocks
                  .map((b) => b.node.attrs?.blockId)
                  .filter(Boolean);

                // Create explicit snapshot
                if (!engine || !engine.blocks) {
                  
                  return false;
                }

                const engineSnapshot = {
                  blocks: engine.blocks.map((b: any) => ({
                    blockId: b.blockId,
                    indent: b.indent,
                  })),
                };

                // 🔒 DELEGATE TO AUTHORITY
                performStructuralDelete({
                  editor,
                  engineSnapshot,
                  blockIds,
                  source: 'handle',
                });

                return true;
              }
            }

            // Case 2: Engine block selection (halo click)
            if (engine.selection.kind === 'block') {
              event.preventDefault();
              event.stopPropagation();

              const blockIds = engine.selection.blockIds;

              

              // Create explicit snapshot
              if (!engine.blocks) {
                
                return false;
              }

              const engineSnapshot = {
                blocks: engine.blocks.map((b: any) => ({
                  blockId: b.blockId,
                  indent: b.indent,
                })),
              };

              // 🔒 DELEGATE TO AUTHORITY
              performStructuralDelete({
                editor,
                engineSnapshot,
                blockIds,
                source: 'handle',
              });

              return true;
            }

            // Case 3: Not a block selection → let keyboard rules handle
            return false;
          },
        },
      }),
    ];
  },
});
