/**
 * BlockDescription Node - Block-attached metadata content
 *
 * Real ProseMirror node (not attribute) for block descriptions.
 * Lives as a SIBLING to content blocks (ProseMirror-native pattern).
 *
 * Architecture Decision:
 * - Description is document content (copy/paste, undo/redo, collaboration)
 * - NOT chrome/overlay (no absolute positioning, no modal state)
 * - Position defines ownership (always belongs to block immediately above)
 * - Keyboard rules enforce semantic coupling (Enter, Backspace, Delete)
 *
 * Document Structure:
 * ```
 * doc
 * ├─ paragraph
 * ├─ blockDescription  ← Belongs to paragraph above
 * ├─ heading
 * ├─ blockDescription  ← Belongs to heading above
 * ```
 *
 * Why Sibling (Not Child)?
 * - ProseMirror cannot mix inline and block content in same node
 * - Wrapper nodes would require massive refactor of all block types
 * - Sibling + keyboard rules achieves same UX as Workflowy
 * - Pragmatic, scalable, incrementally implementable
 *
 * Benefits vs Attribute/Overlay:
 * - ✅ Copy/paste automatic (PM handles it)
 * - ✅ Undo/redo automatic (PM history)
 * - ✅ Flow layout (zero overlap bugs)
 * - ✅ Collaboration ready (Y.js/CRDT sync)
 * - ✅ No geometry tracking needed
 * - ✅ No ghost spacers
 * - ✅ No modal editor state
 * - ✅ Consistent across all block types
 *
 * Keyboard Behavior:
 * - Enter: Exit to next block
 * - Backspace (empty): Delete description node
 * - Arrow Up/Down: Navigate to/from parent block
 */

import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { BlockDescriptionNode } from '../../components/blocks/BlockDescriptionNode';

export const BlockDescription = Node.create({
  name: 'blockDescription',

  // Block-level node (sibling pattern)
  group: 'block',

  // Contains inline content (text with marks)
  content: 'inline*',

  // NOT defining - allows normal merge behavior during edits
  defining: false,

  // Cannot be block-selected (only text-selected when focused)
  selectable: false,

  // Isolating prevents splitting across this boundary
  isolating: true,

  // Attributes
  addAttributes() {
    return {
      // No blockId - descriptions are content but not blocks
      // No parentBlockId - adjacency defines ownership (Workflowy pattern)
      // Position alone is sufficient: "belongs to block immediately above"
    };
  },

  // Parse from HTML (high priority to avoid conflicts)
  parseHTML() {
    return [
      {
        tag: 'div[data-type="block-description"]',
        priority: 1000,
      },
    ];
  },

  // Render to HTML
  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-type': 'block-description' }, 0];
  },

  // Use React NodeView for rendering
  addNodeView() {
    return ReactNodeViewRenderer(BlockDescriptionNode);
  },

  // Keyboard shortcuts
  addKeyboardShortcuts() {
    return {
      // Enter: Exit description and move to next block
      Enter: ({ editor }) => {
        const { state } = editor;
        const { $from } = state.selection;

        if ($from.parent.type.name !== 'blockDescription') return false;

        const after = $from.after();
        const next = state.doc.nodeAt(after);

        if (next) {
          // Focus existing next block
          editor.commands.setTextSelection(after + 1);
        } else {
          // Create new paragraph
          editor
            .chain()
            .insertContentAt(after, { type: 'paragraph' })
            .setTextSelection(after + 1)
            .run();
        }

        return true;
      },

      // Backspace: Delete description if empty and at start
      Backspace: ({ editor }) => {
        const { state } = editor;
        const { $from } = state.selection;

        if (
          $from.parent.type.name === 'blockDescription' &&
          $from.parent.content.size === 0 &&
          $from.parentOffset === 0
        ) {
          const from = $from.before();
          const to = from + $from.parent.nodeSize;

          editor.commands.deleteRange({ from, to });
          return true;
        }

        return false;
      },

      // Shift+Enter: Allow line breaks in description
      'Shift-Enter': ({ editor }) => {
        const { state } = editor;
        const { $from } = state.selection;

        if ($from.parent.type.name === 'blockDescription') {
          return editor.commands.insertContent('\n');
        }

        return false;
      },
    };
  },
});
