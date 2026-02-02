/**
 * Slash Command Registry
 *
 * All available slash commands for the block editor.
 */

import type { SlashCommand, CommandRegistry, CommandContext } from './types';
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
} from 'lexical';
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { $createCodeNode } from '@lexical/code';
import { $createListNode, $createListItemNode } from '@lexical/list';

/**
 * Helper to replace current block with new node
 */
function replaceBlockContent(context: CommandContext, createNode: () => any) {
  context.editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const node = selection.anchor.getNode();
    const parent = node.getParent();

    if (parent) {
      const newNode = createNode();
      parent.replace(newNode);
      newNode.select();
    }

    context.closeMenu();
  });
}

/**
 * All available slash commands
 */
const commands: SlashCommand[] = [
  // === BASIC TEXT BLOCKS ===
  {
    id: 'paragraph',
    label: 'Paragraph',
    description: 'Plain text block',
    icon: '📝',
    category: 'basic',
    blockType: 'paragraph',
    keywords: ['text', 'p'],
    execute: (context) => {
      replaceBlockContent(context, () => $createParagraphNode());
    },
  },

  // === HEADINGS ===
  {
    id: 'heading1',
    label: 'Heading 1',
    description: 'Large section heading',
    icon: 'H1',
    category: 'text',
    blockType: 'heading',
    keywords: ['h1', 'title', 'heading'],
    execute: (context) => {
      replaceBlockContent(context, () => $createHeadingNode('h1'));
    },
  },
  {
    id: 'heading2',
    label: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H2',
    category: 'text',
    blockType: 'heading',
    keywords: ['h2', 'subtitle', 'heading'],
    execute: (context) => {
      replaceBlockContent(context, () => $createHeadingNode('h2'));
    },
  },
  {
    id: 'heading3',
    label: 'Heading 3',
    description: 'Small section heading',
    icon: 'H3',
    category: 'text',
    blockType: 'heading',
    keywords: ['h3', 'subheading', 'heading'],
    execute: (context) => {
      replaceBlockContent(context, () => $createHeadingNode('h3'));
    },
  },

  // === LISTS ===
  {
    id: 'bulletlist',
    label: 'Bullet List',
    description: 'Unordered list',
    icon: '•',
    category: 'text',
    blockType: 'bulletList',
    keywords: ['ul', 'unordered', 'bullet', 'list'],
    execute: (context) => {
      context.editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const node = selection.anchor.getNode();
        const parent = node.getParent();

        if (parent) {
          const listNode = $createListNode('bullet');
          const listItemNode = $createListItemNode();
          listNode.append(listItemNode);
          parent.replace(listNode);
          listItemNode.select();
        }

        context.closeMenu();
      });
    },
  },
  {
    id: 'numberedlist',
    label: 'Numbered List',
    description: 'Ordered list',
    icon: '1.',
    category: 'text',
    blockType: 'numberedList',
    keywords: ['ol', 'ordered', 'numbered', 'list'],
    execute: (context) => {
      context.editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const node = selection.anchor.getNode();
        const parent = node.getParent();

        if (parent) {
          const listNode = $createListNode('number');
          const listItemNode = $createListItemNode();
          listNode.append(listItemNode);
          parent.replace(listNode);
          listItemNode.select();
        }

        context.closeMenu();
      });
    },
  },

  // === CODE & QUOTE ===
  {
    id: 'code',
    label: 'Code Block',
    description: 'Code with syntax highlighting',
    icon: '💻',
    category: 'text',
    blockType: 'code',
    keywords: ['code', 'snippet', 'programming'],
    execute: (context) => {
      replaceBlockContent(context, () => $createCodeNode());
    },
  },
  {
    id: 'quote',
    label: 'Quote',
    description: 'Block quote',
    icon: '💬',
    category: 'text',
    blockType: 'quote',
    keywords: ['quote', 'blockquote', 'citation'],
    execute: (context) => {
      replaceBlockContent(context, () => $createQuoteNode());
    },
  },

  // === ADVANCED (Placeholders for future) ===
  {
    id: 'divider',
    label: 'Divider',
    description: 'Horizontal line',
    icon: '—',
    category: 'basic',
    keywords: ['hr', 'line', 'separator'],
    execute: (context) => {
      // TODO: Implement divider node
      console.log('Divider not yet implemented');
      context.closeMenu();
    },
  },
  {
    id: 'callout',
    label: 'Callout',
    description: 'Highlighted note',
    icon: '💡',
    category: 'basic',
    blockType: 'callout',
    keywords: ['note', 'info', 'warning'],
    execute: (context) => {
      // TODO: Implement callout node
      console.log('Callout not yet implemented');
      context.closeMenu();
    },
  },
  {
    id: 'table',
    label: 'Table',
    description: 'Insert table',
    icon: '⊞',
    category: 'advanced',
    keywords: ['table', 'grid', 'spreadsheet'],
    execute: (context) => {
      // TODO: Implement table node
      console.log('Table not yet implemented');
      context.closeMenu();
    },
  },
  {
    id: 'image',
    label: 'Image',
    description: 'Upload or embed image',
    icon: '🖼️',
    category: 'media',
    keywords: ['image', 'picture', 'photo'],
    execute: (context) => {
      // TODO: Implement image upload
      console.log('Image not yet implemented');
      context.closeMenu();
    },
  },
];

/**
 * Create command registry with search capabilities
 */
export function createCommandRegistry(): CommandRegistry {
  return {
    commands,

    getByCategory(category) {
      return commands.filter((cmd) => cmd.category === category);
    },

    search(query) {
      if (!query || query.trim() === '') {
        return commands;
      }

      const lowerQuery = query.toLowerCase().trim();

      return commands.filter((cmd) => {
        // Match label
        if (cmd.label.toLowerCase().includes(lowerQuery)) {
          return true;
        }

        // Match description
        if (cmd.description?.toLowerCase().includes(lowerQuery)) {
          return true;
        }

        // Match keywords
        if (cmd.keywords?.some((kw) => kw.toLowerCase().includes(lowerQuery))) {
          return true;
        }

        return false;
      });
    },

    getById(id) {
      return commands.find((cmd) => cmd.id === id);
    },
  };
}

/**
 * Default command registry instance
 */
export const defaultCommandRegistry = createCommandRegistry();
