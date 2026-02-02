/**
 * CodeBlock Node - Multi-line code block
 *
 * Block element for code with syntax highlighting.
 * - Language attribute for highlighting
 * - Monospace font
 * - Dark background
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { CodeBlock as CodeBlockComponent } from '../../components/blocks/CodeBlock';
// NOTE: Structural keyboard logic is handled via keyboard rules (indent/outdent intents)

// NOTE: indentBlock/outdentBlock removed - now handled via keyboard rules

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    codeBlock: {
      /**
       * Set a code block node
       */
      setCodeBlock: (attributes?: { language?: string }) => ReturnType;
      /**
       * Toggle a code block node
       */
      toggleCodeBlock: (attributes?: { language?: string }) => ReturnType;
    };
  }
}

export const CodeBlock = Node.create({
  name: 'codeBlock',

  // ❌ REMOVED: priority: 1000 was breaking composition input
  // Keyboard handlers should not interfere with ProseMirror's input system
  // priority: 1000,

  // Block-level content
  group: 'block',

  // Contains text directly (no inline marks)
  content: 'text*',

  // Marks are not allowed inside code blocks
  marks: '',

  // Code blocks are their own entity
  code: true,
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
      language: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-language'),
        renderHTML: (attributes) => {
          if (!attributes.language) return {};
          return { 'data-language': attributes.language };
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
      {
        tag: 'pre',
        preserveWhitespace: 'full',
      },
    ];
  },

  // Render to HTML (fallback)
  renderHTML({ node, HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes(HTMLAttributes, {
        'data-language': node.attrs.language,
      }),
      ['code', {}, 0],
    ];
  },

  // Use React component for rendering
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent);
  },

  // Commands
  addCommands() {
    return {
      setCodeBlock:
        (attributes) =>
        ({ commands }) => {
          return commands.setNode(this.name, attributes);
        },
      toggleCodeBlock:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleNode(this.name, 'paragraph', attributes);
        },
    };
  },

  // Keyboard shortcuts
  addKeyboardShortcuts() {
    return {
      'Mod-Alt-c': () => this.editor.commands.toggleCodeBlock(),

      // NOTE: Tab inside code blocks has special behavior (inserts literal tab).
      // This is preserved as it's content editing, not structural.
      // Structural indent/outdent via keyboard rules (indent-block/outdent-block intents).
      Tab: ({ editor }) => {
        if (!editor.isActive('codeBlock')) return false;
        return editor.commands.insertContent('\t');
      },

      // Shift+Enter: Insert newline (same as Enter for code blocks)
      'Shift-Enter': ({ editor }) => {
        // Check if we're inside a codeBlock
        const { state } = editor;
        const { $from } = state.selection;

        if ($from.parent.type.name === this.name) {
          return editor.commands.insertContent('\n');
        }

        return false;
      },

      // 🔒 Enter - NEUTERED (Step 4 - Exclusive Ownership)
      // ALL Enter behavior now handled by KeyboardShortcuts → KeyboardEngine → Rules
      // Node extensions must NEVER mutate state in keyboard handlers.
      //
      // REMOVED LOGIC (to be reintroduced centrally if needed):
      // - Double-enter exit from code block
      //
      Enter: () => {
        return false; // Delegate to KeyboardEngine
      },
    };
  },
});
