/**
 * Paragraph Node - Base block element
 *
 * The default block element for text content.
 * Uses uniform block structure (no marker, just content).
 * No margin - parent handles spacing via gap.
 */

import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { ParagraphBlock } from '../../components/blocks/ParagraphBlock';

// NOTE: indentBlock/outdentBlock removed - now handled via keyboard rules
// NOTE: Arrow navigation removed - now centralized in KeyboardShortcuts.ts

declare module '@tiptap/core' {
  // eslint-disable-next-line no-unused-vars
  interface Commands<ReturnType> {
    paragraph: {
      /**
       * Set a paragraph node
       */
      setParagraph: () => ReturnType;
    };
  }
}

export const Paragraph = Node.create({
  name: 'paragraph',

  // Block-level content
  group: 'block',

  // Contains inline content (text with marks)
  content: 'inline*',

  // ❌ REMOVED: priority: 1000 was breaking composition input
  // Keyboard handlers that return false don't need high priority
  // priority: 1000,

  // Attributes
  addAttributes() {
    return {
      blockId: {
        // 🔒 BLOCK IDENTITY LAW: blockId assigned ONLY by:
        // 1. BlockIdGenerator.onCreate() (fills gaps on mount)
        // 2. performStructuralEnter() (explicit creation)
        // 3. parseHTML (loading saved content)
        // NEVER by PM schema defaults (prevents regeneration during transactions)
        default: null,
        parseHTML: (element) => element.getAttribute('data-block-id') || null,
        renderHTML: (attributes) => {
          if (attributes.blockId) {
            return { 'data-block-id': attributes.blockId };
          }
          return {};
        },
      },
      tags: {
        default: [],
        parseHTML: (element) => {
          const tagsAttr = element.getAttribute('data-tags');
          return tagsAttr ? JSON.parse(tagsAttr) : [];
        },
        renderHTML: (attributes) => {
          if (attributes.tags?.length) {
            return {
              'data-tags': JSON.stringify(attributes.tags),
            };
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
      // 🔥 FLAT MODEL: collapsed for visibility
      collapsed: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute('data-collapsed') === 'true',
        renderHTML: (attributes) => {
          if (attributes.collapsed) {
            return { 'data-collapsed': 'true' };
          }
          return {};
        },
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
    return [{ tag: 'p' }];
  },

  // Render to HTML (for copy/paste, export)
  renderHTML({ HTMLAttributes }) {
    return ['p', HTMLAttributes, 0];
  },

  // Use React NodeView for rendering in editor
  // Uses ParagraphBlock wrapper which adds block handle for top-level paragraphs
  addNodeView() {
    return ReactNodeViewRenderer(ParagraphBlock);
  },

  // Commands
  addCommands() {
    return {
      setParagraph:
        () =>
        ({ commands }) => {
          return commands.setNode(this.name);
        },
    };
  },

  // Keyboard shortcuts
  addKeyboardShortcuts() {
    return {
      // NOTE: Arrow navigation is centrally handled in KeyboardShortcuts.ts
      // Removed from here to prevent TipTap handler collision (multiple extensions = cursor freeze)

      // Cmd/Ctrl+Alt+0 to convert to paragraph
      'Mod-Alt-0': () => this.editor.commands.setParagraph(),

      // NOTE: Tab / Shift+Tab behavior is centrally handled
      // via keyboard rules emitting indent-block / outdent-block intents.
      // Node extensions must not handle structural keyboard logic.

      // NOTE: Shift+Enter handled by built-in HardBreak extension

      // 🔒 Enter - NEUTERED (Step 4 - Exclusive Ownership)
      // ALL Enter behavior now handled by KeyboardShortcuts → KeyboardEngine → Rules
      // This ensures deterministic, centralized behavior across all block types.
      //
      // REMOVED LOGIC (to be reintroduced centrally if needed):
      // - Hashtag detection (#tag conversion)
      // - Special parentBlockId handling
      // - Custom paragraph splitting
      //
      // Node extensions must NEVER mutate state in keyboard handlers.
      Enter: () => {
        return false; // Delegate to KeyboardEngine
      },

      // Cmd+Enter: Move to end of current block and create new paragraph below
      'Mod-Enter': ({ editor }) => {
        const { state } = editor;
        const { $from } = state.selection;

        // Find the end of the current block
        const endOfBlock = $from.end($from.depth);

        // Create transaction
        const { tr } = state;

        // Move cursor to end of current block
        tr.setSelection(TextSelection.create(tr.doc, endOfBlock));

        // Insert new paragraph after current block
        const paragraphType = state.schema.nodes.paragraph;
        if (!paragraphType) return false;

        const afterBlock = $from.after($from.depth);
        tr.insert(
          afterBlock,
          paragraphType.create({
            blockId: crypto.randomUUID(), // ✅ NEW ID for new paragraph!
            indent: 0,
            collapsed: false,
            tags: [],
          })
        );

        // Move cursor to new paragraph
        tr.setSelection(TextSelection.create(tr.doc, afterBlock + 1));

        editor.view.dispatch(tr);
        return true;
      },

      // 🔒 Backspace - NEUTERED (Step 4 - Exclusive Ownership)
      // ALL Backspace behavior now handled by KeyboardShortcuts → KeyboardEngine → Rules
      // Node extensions must NEVER mutate state in keyboard handlers.
      Backspace: () => {
        return false; // Delegate to KeyboardEngine
      },

      // 🔒 Delete - NEUTERED (Step 4 - Exclusive Ownership)
      // ALL Delete behavior now handled by KeyboardShortcuts → KeyboardEngine → Rules
      // Node extensions must NEVER mutate state in keyboard handlers.
      Delete: () => {
        return false; // Delegate to KeyboardEngine
      },
    };
  },
});
