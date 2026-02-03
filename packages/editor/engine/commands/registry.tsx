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
  $isRootNode,
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
  AlertTriangle,
  XCircle,
  CheckCircle,
  Code,
  Minus,
  WaveLine,
  Sticker,
  TextColumns,
} from '@clutter/ui';
import { FIELD_BLOCK_DEFAULTS } from '../blocks/schemas/field';

/**
 * Helper to replace current block with new node while preserving content
 */
function replaceBlockContent(context: CommandContext, createNode: () => any) {
  context.editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;

    const root = $getRoot();
    const firstChild = root.getFirstChild();

    if (firstChild && !$isRootNode(firstChild)) {
      const newNode = createNode();

      // Transfer all children (text content) from old node to new node
      const children = firstChild.getChildren();
      children.forEach((child) => newNode.append(child));

      firstChild.replace(newNode);
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
      context.blockStore.updateType(context.blockId, 'paragraph');
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
      context.blockStore.updateType(context.blockId, 'heading');
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
      context.blockStore.updateType(context.blockId, 'heading');
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
      context.blockStore.updateType(context.blockId, 'heading');
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

        const root = $getRoot();
        const firstChild = root.getFirstChild();

        if (firstChild && !$isRootNode(firstChild)) {
          const listNode = $createListNode('bullet');
          const listItemNode = $createListItemNode();

          // Transfer children (text content) to list item
          const children = firstChild.getChildren();
          children.forEach((child) => listItemNode.append(child));

          listNode.append(listItemNode);
          firstChild.replace(listNode);
          listItemNode.select();
        }

        context.closeMenu();
      });
      context.blockStore.updateType(context.blockId, 'list');
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

        const root = $getRoot();
        const firstChild = root.getFirstChild();

        if (firstChild && !$isRootNode(firstChild)) {
          const listNode = $createListNode('number');
          const listItemNode = $createListItemNode();

          // Transfer children (text content) to list item
          const children = firstChild.getChildren();
          children.forEach((child) => listItemNode.append(child));

          listNode.append(listItemNode);
          firstChild.replace(listNode);
          listItemNode.select();
        }

        context.closeMenu();
      });
      context.blockStore.updateType(context.blockId, 'list');
    },
  },
  {
    id: 'checklist',
    label: 'Checklist',
    icon: <CheckSquare />,
    category: 'lists',
    keywords: ['todo', 'checkbox', 'check', 'task'],
    execute: (context) => {
      context.blockStore.updateType(context.blockId, 'checklist');
      context.blockStore.updateProperties(context.blockId, { checked: false });
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
      context.blockStore.updateType(context.blockId, 'toggle');
      context.blockStore.updateProperties(context.blockId, {
        collapsed: false,
      });
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
      context.blockStore.updateType(context.blockId, 'quote');
    },
  },
  // === CALLOUTS ===
  {
    id: 'callout-info',
    label: 'Info Callout',
    icon: <Info />,
    category: 'callouts',
    blockType: 'callout',
    keywords: ['callout', 'info', 'note', 'information'],
    execute: (context) => {
      context.blockStore.updateType(context.blockId, 'callout');
      context.blockStore.updateProperties(context.blockId, { variant: 'info' });
      context.closeMenu();
    },
  },
  {
    id: 'callout-warning',
    label: 'Warning Callout',
    icon: <AlertTriangle />,
    category: 'callouts',
    blockType: 'callout',
    keywords: ['callout', 'warning', 'caution', 'alert'],
    execute: (context) => {
      context.blockStore.updateType(context.blockId, 'callout');
      context.blockStore.updateProperties(context.blockId, {
        variant: 'warning',
      });
      context.closeMenu();
    },
  },
  {
    id: 'callout-error',
    label: 'Error Callout',
    icon: <XCircle />,
    category: 'callouts',
    blockType: 'callout',
    keywords: ['callout', 'error', 'danger', 'fail'],
    execute: (context) => {
      context.blockStore.updateType(context.blockId, 'callout');
      context.blockStore.updateProperties(context.blockId, {
        variant: 'error',
      });
      context.closeMenu();
    },
  },
  {
    id: 'callout-success',
    label: 'Success Callout',
    icon: <CheckCircle />,
    category: 'callouts',
    blockType: 'callout',
    keywords: ['callout', 'success', 'done', 'complete'],
    execute: (context) => {
      context.blockStore.updateType(context.blockId, 'callout');
      context.blockStore.updateProperties(context.blockId, {
        variant: 'success',
      });
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
      context.blockStore.updateType(context.blockId, 'code');
    },
  },

  // === DIVIDERS ===
  {
    id: 'divider',
    label: 'Divider',
    icon: <Minus />,
    category: 'dividers',
    keywords: ['hr', 'line', 'separator', 'horizontal'],
    execute: (context) => {
      context.blockStore.updateType(context.blockId, 'divider');
      context.blockStore.updateProperties(context.blockId, { style: 'plain' });
      context.closeMenu();
    },
  },
  {
    id: 'wavy-divider',
    label: 'Wavy Divider',
    icon: <WaveLine />,
    category: 'dividers',
    keywords: ['hr', 'line', 'separator', 'horizontal', 'wave', 'wavy'],
    execute: (context) => {
      context.blockStore.updateType(context.blockId, 'divider');
      context.blockStore.updateProperties(context.blockId, { style: 'wavy' });
      context.closeMenu();
    },
  },

  // === ADVANCED ===
  {
    id: 'field',
    label: 'Field',
    icon: <TextColumns />,
    category: 'advanced',
    blockType: 'field',
    keywords: ['field', 'property', 'key', 'value', 'data', 'structured'],
    execute: (context) => {
      context.blockStore.updateType(context.blockId, 'field');
      context.blockStore.updateProperties(
        context.blockId,
        FIELD_BLOCK_DEFAULTS
      );
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
