/**
 * Blockquote Node - Quoted text block
 *
 * Block element with left border for quoted content.
 * Contains inline content (text with marks).
 * - Markdown: > text
 * - 2px vertical margin
 * - 3px left border
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Blockquote as BlockquoteComponent } from '../../components/blocks/Blockquote';

// NOTE: indentBlock/outdentBlock removed - now handled via keyboard rules

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockquote: {
      /**
       * Set a blockquote node
       */
      setBlockquote: () => ReturnType;
      /**
       * Toggle a blockquote node
       */
      toggleBlockquote: () => ReturnType;
      /**
       * Unset a blockquote node
       */
      unsetBlockquote: () => ReturnType;
    };
  }
}

export const Blockquote = Node.create({
  name: 'blockquote',

  // ❌ REMOVED: priority: 1000 was breaking composition input
  // Keyboard handlers should not interfere with ProseMirror's input system
  // priority: 1000,

  // Block-level content
  group: 'block',

  // Contains inline content (text with marks)
  content: 'inline*',

  // Defines its own boundaries
  defining: true,

  // Attributes
  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-block-id') || null,
        renderHTML: (attributes) => {
          if (attributes.blockId) {
            return { 'data-block-id': attributes.blockId };
          }
          return {};
        },
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
      collapsed: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute('data-collapsed') === 'true',
        renderHTML: (attributes) => ({
          'data-collapsed': attributes.collapsed || false,
        }),
      },
      // Block metadata: creation timestamp
      createdAt: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-created-at') || null,
        renderHTML: (attributes) => {
          if (attributes.createdAt) {
            return { 'data-created-at': attributes.createdAt };
          }
          return {};
        },
      },
      // Block metadata: last updated timestamp
      updatedAt: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-updated-at') || null,
        renderHTML: (attributes) => {
          if (attributes.updatedAt) {
            return { 'data-updated-at': attributes.updatedAt };
          }
          return {};
        },
      },
    };
  },

  // Parse from HTML
  parseHTML() {
    return [{ tag: 'blockquote' }];
  },

  // Render to HTML (fallback)
  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(HTMLAttributes), 0];
  },

  // Use React component for rendering
  addNodeView() {
    return ReactNodeViewRenderer(BlockquoteComponent) as any;
  },

  // Commands
  addCommands() {
    return {
      setBlockquote:
        () =>
        ({ commands, state }) => {
          // 🔒 BLOCK IDENTITY LAW: Assign blockId when wrapping
          const { $from } = state.selection;
          const currentNode = $from.node($from.depth);
          return commands.wrapIn(this.name, {
            blockId: crypto.randomUUID(),
            indent: currentNode?.attrs?.indent ?? 0,
            collapsed: false,
          });
        },
      toggleBlockquote:
        () =>
        ({ commands, state }) => {
          // 🔒 BLOCK IDENTITY LAW: Assign blockId when wrapping
          const { $from } = state.selection;
          const currentNode = $from.node($from.depth);
          return commands.toggleWrap(this.name, {
            blockId: crypto.randomUUID(),
            indent: currentNode?.attrs?.indent ?? 0,
            collapsed: false,
          });
        },
      unsetBlockquote:
        () =>
        ({ commands }) => {
          return commands.lift(this.name);
        },
    };
  },

  // Keyboard shortcuts
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-b': () => this.editor.commands.toggleBlockquote(),

      // NOTE: Tab / Shift+Tab behavior is centrally handled
      // via keyboard rules emitting indent-block / outdent-block intents.
      // Node extensions must not handle structural keyboard logic.

      // NOTE: Shift+Enter handled by built-in HardBreak extension

      // 🔒 Enter - NEUTERED (Step 4 - Exclusive Ownership)
      // ALL Enter behavior now handled by KeyboardShortcuts → KeyboardEngine → Rules
      // Node extensions must NEVER mutate state in keyboard handlers.
      Enter: () => {
        return false; // Delegate to KeyboardEngine
      },

      // 🔒 Backspace - NEUTERED (Step 4 - Exclusive Ownership)
      // ALL Backspace behavior now handled by KeyboardShortcuts → KeyboardEngine → Rules
      Backspace: () => {
        return false; // Delegate to KeyboardEngine
      },
    };
  },
});
