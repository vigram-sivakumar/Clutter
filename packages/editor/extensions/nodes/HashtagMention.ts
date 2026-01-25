/**
 * HashtagMention - Inline atomic node for hashtag mentions (#tag)
 * 
 * Stores tag name and displays with TagPill styling
 * Cursor jumps over it (atomic) like DateMention
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { HashtagView } from '../../components/inline/HashtagView';

export interface HashtagMentionOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    hashtagMention: {
      /**
       * Insert a hashtag mention
       */
      insertHashtagMention: (attributes: { tag: string }) => ReturnType;
    };
  }
}

export const HashtagMention = Node.create<HashtagMentionOptions>({
  name: 'hashtagMention',

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
        tag: 'span[data-type="hashtag-mention"]',
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
          'data-type': 'hashtag-mention',
          class: 'hashtag-mention',
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
      insertHashtagMention: attributes => ({ commands }) => {
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
    return ReactNodeViewRenderer(HashtagView);
  },
});
