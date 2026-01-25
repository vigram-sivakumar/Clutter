/**
 * Hashtag - Inline atomic node for hashtag mentions (#tag)
 * 
 * Stores tag name and displays with TagPill styling
 * Cursor jumps over it (atomic) like DateMention
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { HashtagView } from '../../components/inline/HashtagView';

export interface HashtagOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    hashtag: {
      /**
       * Insert a hashtag mention
       */
      insertHashtag: (attributes: { tag: string }) => ReturnType;
    };
  }
}

export const Hashtag = Node.create<HashtagOptions>({
  name: 'hashtag',

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
      tag: {
        default: null,
        parseHTML: element => element.getAttribute('data-tag'),
        renderHTML: attributes => {
          if (!attributes.tag) {
            return {};
          }
          return {
            'data-tag': attributes.tag,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="hashtag"]',
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
          'data-type': 'hashtag',
          class: 'hashtag',
        }
      ),
      node.attrs.tag, // Display text (styling handled by NodeView)
    ];
  },

  renderText({ node }) {
    return `#${node.attrs.tag}`; // For copy/paste, keep # in text
  },

  addCommands() {
    return {
      insertHashtag: attributes => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: attributes,
        });
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(HashtagView);
  },
});
