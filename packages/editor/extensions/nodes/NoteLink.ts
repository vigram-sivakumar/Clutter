/**
 * NoteLink - Inline atomic node for linking to notes, folders, and daily notes
 * 
 * Stores target ID and displays with icon/emoji + title
 * Cursor jumps over it (atomic) like DateMention
 * Clickable to navigate to target
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { NoteLinkInline } from '../../components/inline/NoteLinkInline';

export interface NoteLinkOptions {
  HTMLAttributes: Record<string, unknown>;
  onNavigate?: (linkType: 'note' | 'folder', targetId: string) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteLink: {
      /**
       * Insert a note/folder link
       */
      insertNoteLink: (attributes: { 
        linkType: 'note' | 'folder';
        targetId: string;
        label: string;
        emoji: string | null;
      }) => ReturnType;
    };
  }
}

export const NoteLink = Node.create<NoteLinkOptions>({
  name: 'noteLink',

  group: 'inline',
  
  inline: true,
  
  // Atomic - cursor jumps over it, no internal positions
  atom: true,
  
  // Prevent node selection (gapcursor will handle navigation)
  selectable: false,

  addOptions() {
    return {
      HTMLAttributes: {},
      onNavigate: undefined,
    };
  },

  addAttributes() {
    return {
      linkType: {
        default: 'note',
        parseHTML: element => element.getAttribute('data-link-type') || 'note',
        renderHTML: attributes => {
          return {
            'data-link-type': attributes.linkType,
          };
        },
      },
      targetId: {
        default: '',
        parseHTML: element => element.getAttribute('data-target-id') || '',
        renderHTML: attributes => {
          if (!attributes.targetId) {
            return {};
          }
          return {
            'data-target-id': attributes.targetId,
          };
        },
      },
      label: {
        default: 'Untitled',
        parseHTML: element => element.getAttribute('data-label') || 'Untitled',
        renderHTML: attributes => {
          if (!attributes.label) {
            return {};
          }
          return {
            'data-label': attributes.label,
          };
        },
      },
      emoji: {
        default: null,
        parseHTML: element => element.getAttribute('data-emoji'),
        renderHTML: attributes => {
          if (!attributes.emoji) {
            return {};
          }
          return {
            'data-emoji': attributes.emoji,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="note-link"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    // Display format: emoji/icon + label (NO @ sign)
    const label = node.attrs.label || '';
    
    return [
      'span',
      mergeAttributes(
        this.options.HTMLAttributes,
        HTMLAttributes,
        {
          'data-type': 'note-link',
          class: 'note-link',
        }
      ),
      label, // Display text (emoji/icon will be added via CSS ::before or React rendering)
    ];
  },

  renderText({ node }) {
    return node.attrs.label || '';
  },

  addCommands() {
    return {
      insertNoteLink: attributes => ({ commands }) => {
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
    return ReactNodeViewRenderer(NoteLinkInline);
  },
});

