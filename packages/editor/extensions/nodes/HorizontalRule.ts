/**
 * HorizontalRule Node - Divider line
 *
 * Block element that creates a horizontal divider.
 * - Markdown: --- (plain) or *** (wavy)
 * - Not editable (void node)
 * - Supports two styles: 'plain' and 'wavy'
 *
 * 🔒 BLOCK IDENTITY LAW (Phase 2):
 * Every structural node that occupies vertical space MUST have:
 * - A unique blockId (generated via crypto.randomUUID())
 * - An indent attribute (for flat model positioning)
 * This ensures Engine can mirror PM state correctly.
 *
 * INTEGRATION STATUS: ✅ Uses engine.deleteBlock() primitive
 * - Routes deletions through EditorEngine (Editor Law #8)
 * - Children are promoted (never orphaned)
 *
 * Uses React NodeView with inline SVG for theme-aware colors.
 */

import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { HorizontalRule as HorizontalRuleComponent } from '../../components/HorizontalRule';
import type { EditorEngine } from '../../core/engine/EditorEngine';
import { DeleteBlockCommand } from '../../core/engine/command';

/**
 * Get EditorEngine from TipTap editor instance
 */
function getEngine(editor: any): EditorEngine | null {
  return editor._engine || null;
}

declare module '@tiptap/core' {
  // eslint-disable-next-line no-unused-vars
  interface Commands<ReturnType> {
    horizontalRule: {
      /**
       * Insert a horizontal rule (plain style)
       */
      setHorizontalRule: () => ReturnType;
      /**
       * Insert a wavy break line
       */
      setBreakLine: () => ReturnType;
    };
  }
}

export const HorizontalRule = Node.create({
  name: 'horizontalRule',

  // Block-level content
  group: 'block',

  // Void node (no content)
  atom: true,

  // Allow selection by clicking
  selectable: true,

  // Allow dragging
  draggable: true,

  // Attributes
  addAttributes() {
    return {
      style: {
        default: 'plain',
        parseHTML: (element) => element.getAttribute('data-style') || 'plain',
        renderHTML: (attributes) => ({ 'data-style': attributes.style }),
      },
      fullWidth: {
        default: true,
        parseHTML: (element) =>
          element.getAttribute('data-full-width') === 'true',
        renderHTML: (attributes) => ({
          'data-full-width': attributes.fullWidth,
        }),
      },
      color: {
        default: 'default',
        parseHTML: (element) => element.getAttribute('data-color') || 'default',
        renderHTML: (attributes) => ({ 'data-color': attributes.color }),
      },
      blockId: {
        // 🔒 BLOCK IDENTITY LAW: blockId assigned ONLY by:
        // 1. BlockIdGenerator.onCreate() (fills gaps on mount)
        // 2. performStructuralEnter() (explicit creation)
        // 3. parseHTML (loading saved content)
        // NEVER by PM schema defaults (prevents regeneration during transactions)
        default: null,
        parseHTML: (element) => element.getAttribute('data-block-id') || null,
        renderHTML: (attributes) =>
          attributes.blockId ? { 'data-block-id': attributes.blockId } : {},
      },
      // 🔥 FLAT MODEL: indent is the ONLY structural attribute
      indent: {
        default: 0,
        parseHTML: (element) =>
          parseInt(element.getAttribute('data-indent') || '0', 10),
        renderHTML: (attributes) => ({
          'data-indent': attributes.indent || 0,
        }),
      },
      // 🔒 COLLAPSE CONTRACT: All structural blocks must have collapsed attribute
      // HR cannot collapse itself (it's a leaf node), but it must participate
      // in the flat visibility algorithm so it can be hidden by collapsed parents
      collapsed: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute('data-collapsed') === 'true',
        renderHTML: (attributes) => ({
          'data-collapsed': attributes.collapsed || false,
        }),
      },
    };
  },

  // Parse from HTML
  parseHTML() {
    return [{ tag: 'hr' }];
  },

  // Render to HTML (for copy/paste, export)
  renderHTML({ node, HTMLAttributes }) {
    return [
      'hr',
      {
        ...HTMLAttributes,
        'data-block-id': node.attrs.blockId,
        'data-style': node.attrs.style,
        'data-indent': node.attrs.indent || 0,
        'data-collapsed': node.attrs.collapsed || false,
      },
    ];
  },

  // Use React NodeView for rendering in editor
  addNodeView() {
    return ReactNodeViewRenderer(HorizontalRuleComponent);
  },

  // Commands
  addCommands() {
    return {
      setHorizontalRule:
        () =>
        ({ chain, state }) => {
          const { selection } = state;
          const { $from } = selection;
          const endPos = $from.end();

          // Get context from current block
          const currentNode = $from.node($from.depth);
          const currentAttrs = currentNode?.attrs || {};

          return chain()
            .insertContentAt(endPos, {
              type: this.name,
              attrs: {
                blockId: crypto.randomUUID(),
                style: 'plain',
                indent: currentAttrs.indent || 0, // FLAT MODEL
              },
            })
            .run();
        },

      setBreakLine:
        () =>
        ({ chain, state }) => {
          const { selection } = state;
          const { $from } = selection;
          const endPos = $from.end();

          // Get context from current block
          const currentNode = $from.node($from.depth);
          const currentAttrs = currentNode?.attrs || {};

          return chain()
            .insertContentAt(endPos, {
              type: this.name,
              attrs: {
                blockId: crypto.randomUUID(),
                style: 'wavy',
                indent: currentAttrs.indent || 0, // FLAT MODEL
              },
            })
            .run();
        },
    };
  },

  // Keyboard shortcuts for deletion
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { selection } = this.editor.state;
        // Check if HR is selected (NodeSelection)
        if (selection.node?.type.name === this.name) {
          const blockId = selection.node.attrs?.blockId;
          const engine = getEngine(this.editor);

          if (!engine) {
            
            return false;
          }

          if (!blockId) {
            
            return false;
          }

          // ✅ USE ENGINE PRIMITIVE: Delete HR via DeleteBlockCommand
          // This ensures children are promoted (Editor Law #8)
          
          const cmd = new DeleteBlockCommand(blockId);
          engine.dispatch(cmd);
          return true;
        }
        return false;
      },
      Delete: () => {
        const { selection } = this.editor.state;
        if (selection.node?.type.name === this.name) {
          const blockId = selection.node.attrs?.blockId;
          const engine = getEngine(this.editor);

          if (!engine) {
            
            return false;
          }

          if (!blockId) {
            
            return false;
          }

          // ✅ USE ENGINE PRIMITIVE: Delete HR via DeleteBlockCommand
          // This ensures children are promoted (Editor Law #8)
          
          const cmd = new DeleteBlockCommand(blockId);
          engine.dispatch(cmd);
          return true;
        }
        return false;
      },
    };
  },
});
