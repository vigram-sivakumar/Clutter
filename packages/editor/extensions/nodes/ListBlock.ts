/**
 * ListBlock Node - Unified list item (bullet, numbered, task)
 *
 * Notion-style flat list structure where each list item is a top-level block.
 * - No nesting of <ul>/<li> - each item is independent
 * - Level attribute controls indentation (unlimited nesting)
 * - listType determines marker style (bullet, numbered, task)
 * - checked attribute for task lists
 * - collapsed attribute for tasks with subtasks
 * - Contains inline content (text with marks)
 *
 * Features:
 * - Tab: Indent (max 1 level deeper than previous item - Notion-style)
 * - Shift+Tab: Outdent (cascades to children)
 * - Enter: New list item or exit to paragraph if empty
 * - Backspace: Outdent or convert to paragraph
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { spacing } from '../../tokens';
import type { ListType, ListBlockAttrs } from '../../types';
import { ListBlock as ListBlockComponent } from '../../components/blocks/ListBlock';
import { handleEnter } from '../../plugins/keyboard';
// NOTE: Arrow navigation removed - now centralized in KeyboardShortcuts.ts

// NOTE: indentBlock/outdentBlock removed - now handled via keyboard rules

declare module '@tiptap/core' {
  // eslint-disable-next-line no-unused-vars
  interface Commands<ReturnType> {
    listBlock: {
      /**
       * Set a list block with specified type
       */
      setListBlock: (_listType: ListType, _checked?: boolean) => ReturnType;
      /**
       * Toggle list block type
       */
      toggleListBlock: (_listType: ListType) => ReturnType;
    };
  }
}

export const ListBlock = Node.create({
  name: 'listBlock',

  // ❌ REMOVED: priority: 1000 was breaking composition input after ~29 chars
  // Keyboard handlers that just return false don't need high priority
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
      listType: {
        default: 'bullet' as ListType,
        parseHTML: (element) =>
          element.getAttribute('data-list-type') || 'bullet',
        renderHTML: (attributes) => ({ 'data-list-type': attributes.listType }),
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
      checked: {
        default: null,
        parseHTML: (element) => {
          const val = element.getAttribute('data-checked');
          return val === 'true' ? true : val === 'false' ? false : null;
        },
        renderHTML: (attributes) => {
          if (attributes.checked === null) return {};
          return { 'data-checked': attributes.checked ? 'true' : 'false' };
        },
      },
      collapsed: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute('data-collapsed') === 'true',
        renderHTML: (attributes) => {
          if (!attributes.collapsed) return {};
          return { 'data-collapsed': 'true' };
        },
      },
      priority: {
        default: 0,
        parseHTML: (element) =>
          parseInt(element.getAttribute('data-priority') || '0', 10),
        renderHTML: (attributes) => {
          if (!attributes.priority) return {};
          return { 'data-priority': attributes.priority };
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
    return [
      {
        tag: 'div[data-type="listBlock"]',
      },
    ];
  },

  // Render to HTML (for non-React contexts)
  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as ListBlockAttrs;
    const indent = attrs.indent * spacing.indent;

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'listBlock',
        style: `
          margin: ${spacing.margin}px 0;
          padding-left: ${indent}px;
        `
          .replace(/\s+/g, ' ')
          .trim(),
      }),
      0,
    ];
  },

  // Use React component for rendering
  addNodeView() {
    return ReactNodeViewRenderer(ListBlockComponent);
  },

  // Commands
  addCommands() {
    return {
      setListBlock:
        (listType, checked = false) =>
        ({ commands }) => {
          const attrs: Partial<ListBlockAttrs> = { listType, indent: 0 };
          if (listType === 'task') {
            attrs.checked = checked;
          }
          return commands.setNode(this.name, attrs);
        },

      toggleListBlock:
        (listType) =>
        ({ commands, editor }) => {
          if (editor.isActive(this.name, { listType })) {
            return commands.setNode('paragraph');
          }
          return commands.setNode(this.name, {
            listType,
            indent: 0,
            checked: listType === 'task' ? false : null,
          });
        },
    };
  },

  // Keyboard shortcuts
  addKeyboardShortcuts() {
    return {
      // NOTE: Arrow navigation is centrally handled in KeyboardShortcuts.ts
      // Removed from here to prevent TipTap handler collision (multiple extensions = cursor freeze)

      // NOTE: Shift+Enter handled by built-in HardBreak extension

      // NOTE: Tab / Shift+Tab behavior is centrally handled
      // via keyboard rules emitting indent-block / outdent-block intents.
      // Node extensions must not handle structural keyboard logic.

      Enter: ({ editor }) => {
        // 🔒 ONLY handle Enter for listBlock nodes, not other block types
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== 'listBlock') return false;
        // NEW: Use rule engine for Enter behavior
        // This handles:
        // - splitListItem (priority 110) - splits at cursor position
        // - exitEmptyListInWrapper (priority 100)
        // - outdentEmptyList (priority 90)
        // All other exit/split behaviors
        //
        // OWNERSHIP CONTRACT: handleEnter returns boolean directly
        const result = handleEnter(editor);

        if (result) {
          return true; // Prevent default TipTap behavior
        }

        // Fallback: default TipTap behavior (shouldn't reach here for lists)
        return false;
      },

      Backspace: ({ editor }) => {
        // 🔒 ONLY handle Backspace for listBlock nodes, not other block types
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== 'listBlock') return false;

        // 🔥 FLAT MODEL: ALL structural deletion handled by KeyboardShortcuts → FlatIntentResolver
        // This node-level handler must NOT handle structural operations
        // Return false → pass through to high-priority KeyboardShortcuts plugin
        // Backspace behavior now handled by KeyboardShortcuts → KeyboardEngine
        return false;
      },

      // 🔒 Delete - NEUTERED (Step 4 - Exclusive Ownership)
      // ALL Delete behavior now handled by KeyboardShortcuts → KeyboardEngine → Rules
      // Node extensions must NEVER mutate state in keyboard handlers.
      Delete: ({ editor }) => {
        // 🔒 ONLY handle Delete for listBlock nodes, not other block types
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== 'listBlock') return false;

        return false; // Delegate to KeyboardEngine
      },
    };
  },
});
