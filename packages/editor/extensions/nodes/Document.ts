/**
 * Document Node - Root container for the editor
 * 
 * This is the top-level node that contains all other content.
 * It uses flexbox layout with gap-based spacing between blocks.
 */

import { Node } from '@tiptap/core';
import { spacing } from '../../tokens';

export const Document = Node.create({
  name: 'doc',

  // Top-level node
  topNode: true,

  // Can contain zero or more blocks
  content: 'block*',

  // No parsing needed - this is the root
  parseHTML() {
    return [];
  },

  // Render as a div with flex layout for consistent spacing
  renderHTML() {
    return [
      'div',
      {
        class: 'editor-document',
        style: `
          display: flex;
          flex-direction: column;
          gap: ${spacing.gap}px;
        `.replace(/\s+/g, ' ').trim(),
      },
      0, // Content placeholder
    ];
  },
});
