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
import {
  Pilcrow,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  ChevronDown,
  Quote,
  Info,
  Code,
} from '@clutter/ui';

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
  // === BASIC (no header) ===
  {
    id: 'paragraph',
    label: 'Paragraph',
    icon: <Pilcrow />,
    category: 'basic',
    blockType: 'paragraph',
    keywords: ['text', 'p'],
    execute: (context) => {
      replaceBlockContent(context, () => $createParagraphNode());
    },
  },
  {
    id: 'heading1',
    label: 'Heading 1',
    icon: <Heading1 />,
    category: 'basic',
    blockType: 'heading',
    keywords: ['h1', 'title', 'heading'],
    execute: (context) => {
      replaceBlockContent(context, () => $createHeadingNode('h1'));
    },
  },
  {
    id: 'heading2',
    label: 'Heading 2',
    icon: <Heading2 />,
    category: 'basic',
    blockType: 'heading',
    keywords: ['h2', 'subtitle', 'heading'],
    execute: (context) => {
      replaceBlockContent(context, () => $createHeadingNode('h2'));
    },
  },
  {
    id: 'heading3',
    label: 'Heading 3',
    icon: <Heading3 />,
    category: 'basic',
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
    icon: <List />,
    category: 'lists',
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
    icon: <ListOrdered />,
    category: 'lists',
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
  {
    id: 'checklist',
    label: 'Checklist',
    icon: <CheckSquare />,
    category: 'lists',
    keywords: ['todo', 'checkbox', 'check', 'task'],
    execute: (context) => {
      // TODO: Implement checklist node
      console.log('Checklist not yet implemented');
      context.closeMenu();
    },
  },
  {
    id: 'toggle',
    label: 'Toggle',
    icon: <ChevronDown />,
    category: 'lists',
    keywords: ['collapse', 'expand', 'accordion'],
    execute: (context) => {
      // TODO: Implement toggle node
      console.log('Toggle not yet implemented');
      context.closeMenu();
    },
  },

  // === DECORATIVES ===
  {
    id: 'quote',
    label: 'Quote',
    icon: <Quote />,
    category: 'decoratives',
    blockType: 'quote',
    keywords: ['quote', 'blockquote', 'citation'],
    execute: (context) => {
      replaceBlockContent(context, () => $createQuoteNode());
    },
  },
  {
    id: 'callout',
    label: 'Callout',
    icon: <Info />,
    category: 'decoratives',
    blockType: 'callout',
    keywords: ['note', 'info', 'warning'],
    execute: (context) => {
      // TODO: Implement callout node
      console.log('Callout not yet implemented');
      context.closeMenu();
    },
  },
  {
    id: 'code',
    label: 'Code Block',
    icon: <Code />,
    category: 'decoratives',
    blockType: 'code',
    keywords: ['code', 'snippet', 'programming'],
    execute: (context) => {
      replaceBlockContent(context, () => $createCodeNode());
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
