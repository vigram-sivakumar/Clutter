/**
 * DateMention - Inline atomic node for date mentions (@Today, @Yesterday, etc.)
 * 
 * Stores actual date value but displays relative format
 * Cursor jumps over it (atomic) like Notion
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { DateMentionView } from '../../components/inline/DateMentionView';

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

  addNodeView() {
    return ReactNodeViewRenderer(DateMentionView);
  },
});

