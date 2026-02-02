/**
 * Heading Node - H1, H2, H3 headings
 *
 * Block-level headings with configurable level attribute.
 * Uses uniform block structure (no marker, just content).
 * No margin - parent handles spacing via gap.
 *
 * - H1: 32px, bold
 * - H2: 24px, semibold
 * - H3: 20px, semibold
 */

import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Heading as HeadingComponent } from '../../components/blocks/Heading';
import type { HeadingLevel } from '../../types';
// PHASE 3.3.a: Imports removed - handlers disabled
// import {
//   convertEmptyBlockToParagraph,
//   insertParagraphAfterBlock,
//   handleEmptyBlockInToggle,
// } from '../../utils/keyboardHelpers';
// import { EnterRules, BackspaceRules } from '../../utils/keyboardRules';

// NOTE: indentBlock/outdentBlock removed - now handled via keyboard rules
// NOTE: Arrow navigation removed - now centralized in KeyboardShortcuts.ts

declare module '@tiptap/core' {
  // eslint-disable-next-line no-unused-vars
  interface Commands<ReturnType> {
    heading: {
      /**
       * Set a heading node with a specific level
       */
      setHeading: (_attributes: { headingLevel: HeadingLevel }) => ReturnType;
      /**
       * Toggle a heading node with a specific level
       */
      toggleHeading: (_attributes: {
        headingLevel: HeadingLevel;
      }) => ReturnType;
    };
  }
}

export const Heading = Node.create({
  name: 'heading',

  // ❌ REMOVED: priority: 1000 was breaking composition input
  // Keyboard handlers should not interfere with ProseMirror's input system
  // priority: 1000,

  // Block-level content
  group: 'block',

  // Contains inline content (text with marks)
  content: 'inline*',

  // Headings define their own boundaries (important for backspace behavior)
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
      headingLevel: {
        default: 1,
        parseHTML: (element) => {
          const tag = element.tagName.toLowerCase();
          const match = tag.match(/^h([1-3])$/);
          return match ? parseInt(match[1], 10) : 1;
        },
        renderHTML: (_attributes) => ({}),
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
      // Block metadata: description
      description: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute('data-description') || null,
        renderHTML: (attributes) => {
          if (attributes.description) {
            return { 'data-description': attributes.description };
          }
          return {};
        },
      },
    };
  },

  // Parse from HTML
  parseHTML() {
    return [
      { tag: 'h1', attrs: { headingLevel: 1 } },
      { tag: 'h2', attrs: { headingLevel: 2 } },
      { tag: 'h3', attrs: { headingLevel: 3 } },
    ];
  },

  // Render to HTML (for copy/paste, export)
  renderHTML({ node, HTMLAttributes }) {
    const headingLevel = node.attrs.headingLevel as HeadingLevel;
    return [`h${headingLevel}`, HTMLAttributes, 0];
  },

  // Use React NodeView for rendering in editor
  addNodeView() {
    return ReactNodeViewRenderer(HeadingComponent);
  },

  // Commands
  addCommands() {
    return {
      setHeading:
        (attributes) =>
        ({ commands }) => {
          return commands.setNode(this.name, attributes);
        },
      toggleHeading:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleNode(this.name, 'paragraph', attributes);
        },
    };
  },

  // Keyboard shortcuts
  addKeyboardShortcuts() {
    return {
      // NOTE: Arrow navigation is centrally handled in KeyboardShortcuts.ts
      // Removed from here to prevent TipTap handler collision (multiple extensions = cursor freeze)

      // Cmd/Ctrl+Alt+1/2/3 for headings
      'Mod-Alt-1': () =>
        this.editor.commands.toggleHeading({ headingLevel: 1 }),
      'Mod-Alt-2': () =>
        this.editor.commands.toggleHeading({ headingLevel: 2 }),
      'Mod-Alt-3': () =>
        this.editor.commands.toggleHeading({ headingLevel: 3 }),

      // NOTE: Tab / Shift+Tab behavior is centrally handled
      // via keyboard rules emitting indent-block / outdent-block intents.
      // Node extensions must not handle structural keyboard logic.

      // NOTE: Shift+Enter handled by built-in HardBreak extension

      // PHASE 3.3.a: Enter handler REMOVED
      // ProseMirror handles splitting naturally now that containers are real
      // Enter: ({ editor }) => {
      //   // OLD HANDLER DISABLED - PM default behavior works correctly
      // },

      // PHASE 3.3.a: Backspace handler REMOVED
      // ProseMirror handles backspace naturally now that containers are real
      // Backspace: ({ editor }) => {
      //   // OLD HANDLER DISABLED - PM default behavior works correctly
      // },
    };
  },
});
