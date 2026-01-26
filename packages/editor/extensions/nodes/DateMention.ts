/**
 * DateMention - Inline atomic node for date mentions (@Today, @Yesterday, etc.)
 * 
 * Stores actual date value but displays relative format
 * Cursor jumps over it (atomic) like Notion
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { DateMentionInline } from '../../components/inline/DateMentionInline';

export interface DateMentionOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    dateMention: {
      /**
       * Insert a date mention
       */
      insertDateMention: (attributes: { date: string; label: string }) => ReturnType;
    };
  }
}

export const DateMention = Node.create<DateMentionOptions>({
  name: 'dateMention',

  group: 'inline',
  
  inline: true,
  
  // Atomic - cursor jumps over it, no internal positions
  atom: true,
  
  // Prevent node selection (gapcursor will handle navigation)
  selectable: false,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      date: {
        default: null,
        parseHTML: element => element.getAttribute('data-date'),
        renderHTML: attributes => {
          if (!attributes.date) {
            return {};
          }
          return {
            'data-date': attributes.date,
          };
        },
      },
      label: {
        default: null,
        parseHTML: element => element.getAttribute('data-label'),
        renderHTML: attributes => {
          if (!attributes.label) {
            return {};
          }
          return {
            'data-label': attributes.label,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="date-mention"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'span',
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        {
          'data-type': 'date-mention',
          class: 'date-mention',
        }
      ),
      node.attrs.label, // Display text (icon handled by NodeView)
    ];
  },

  renderText({ node }) {
    return `@${node.attrs.label}`; // For copy/paste, keep @ in text
  },

  addCommands() {
    return {
      insertDateMention: attributes => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: attributes,
        });
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Handle Backspace: delete node and set selection explicitly
      Backspace: () => {
        const { state } = this.editor;
        const { $from } = state.selection;
        
        // Check if cursor is right after this node type
        const nodeBefore = $from.nodeBefore;
        if (nodeBefore && nodeBefore.type.name === this.name) {
          return this.editor.commands.command(({ tr, dispatch }) => {
            if (dispatch) {
              const posBeforeNode = $from.pos - nodeBefore.nodeSize;
              tr.delete(posBeforeNode, $from.pos);
              // Explicitly set selection after deletion
              tr.setSelection(state.selection.constructor.near(tr.doc.resolve(posBeforeNode)));
            }
            return true;
          });
        }
        return false;
      },
      
      // Handle Delete: delete node and set selection explicitly
      Delete: () => {
        const { state } = this.editor;
        const { $from } = state.selection;
        
        // Check if cursor is right before this node type
        const nodeAfter = $from.nodeAfter;
        if (nodeAfter && nodeAfter.type.name === this.name) {
          return this.editor.commands.command(({ tr, dispatch }) => {
            if (dispatch) {
              tr.delete($from.pos, $from.pos + nodeAfter.nodeSize);
              // Explicitly set selection after deletion
              tr.setSelection(state.selection.constructor.near(tr.doc.resolve($from.pos)));
            }
            return true;
          });
        }
        return false;
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(DateMentionInline);
  },
});

