/**
 * Markdown Transformers
 *
 * Defines inline and block-level markdown shortcuts.
 * These transformers enable Notion-style markdown input.
 */

import type {
  ElementTransformer,
  TextFormatTransformer,
  TextMatchTransformer,
  Transformer,
} from '@lexical/markdown';
import { $createCodeNode, $isCodeNode, CodeNode } from '@lexical/code';
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  HeadingNode,
  QuoteNode,
} from '@lexical/rich-text';
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
} from '@lexical/list';
import { $createTextNode, $isParagraphNode, LexicalNode } from 'lexical';

/**
 * Inline text format transformers
 * These handle **bold**, *italic*, etc.
 */

// Bold: **text** or __text__
export const BOLD: TextFormatTransformer = {
  format: ['bold'],
  tag: '**',
  type: 'text-format',
};

export const BOLD_UNDERSCORE: TextFormatTransformer = {
  format: ['bold'],
  tag: '__',
  type: 'text-format',
};

// Italic: *text* or _text_
export const ITALIC: TextFormatTransformer = {
  format: ['italic'],
  tag: '*',
  type: 'text-format',
};

export const ITALIC_UNDERSCORE: TextFormatTransformer = {
  format: ['italic'],
  tag: '_',
  type: 'text-format',
};

// Strikethrough: ~~text~~
export const STRIKETHROUGH: TextFormatTransformer = {
  format: ['strikethrough'],
  tag: '~~',
  type: 'text-format',
};

// Inline code: `code`
export const INLINE_CODE: TextFormatTransformer = {
  format: ['code'],
  tag: '`',
  type: 'text-format',
};

/**
 * Block-level element transformers
 * These handle # heading, - list, etc.
 */

// Heading: # H1, ## H2, ### H3
export const HEADING: ElementTransformer = {
  dependencies: [HeadingNode],
  export: (node: LexicalNode) => {
    if (!$isHeadingNode(node)) {
      return null;
    }
    const level = Number(node.getTag().slice(1));
    return '#'.repeat(level) + ' ';
  },
  regExp: /^(#{1,3})\s/,
  replace: (parentNode, _children, match) => {
    const tag = ('h' + match[1].length) as 'h1' | 'h2' | 'h3';
    const headingNode = $createHeadingNode(tag);
    parentNode.replace(headingNode);
    return headingNode;
  },
  type: 'element',
};

// Quote: > text
export const QUOTE: ElementTransformer = {
  dependencies: [QuoteNode],
  export: (node: LexicalNode) => {
    return $isQuoteNode(node) ? '> ' : null;
  },
  regExp: /^>\s/,
  replace: (parentNode) => {
    const quoteNode = $createQuoteNode();
    parentNode.replace(quoteNode);
    return quoteNode;
  },
  type: 'element',
};

// Unordered list: - item or * item
export const UNORDERED_LIST: ElementTransformer = {
  dependencies: [ListNode, ListItemNode],
  export: (node: LexicalNode) => {
    return $isListNode(node) && node.getListType() === 'bullet' ? '- ' : null;
  },
  regExp: /^[-*]\s/,
  replace: (parentNode) => {
    const listNode = $createListNode('bullet');
    const listItemNode = $createListItemNode();
    listNode.append(listItemNode);

    if ($isParagraphNode(parentNode)) {
      parentNode.replace(listNode);
    }

    return listItemNode;
  },
  type: 'element',
};

// Ordered list: 1. item
export const ORDERED_LIST: ElementTransformer = {
  dependencies: [ListNode, ListItemNode],
  export: (node: LexicalNode) => {
    return $isListNode(node) && node.getListType() === 'number' ? '1. ' : null;
  },
  regExp: /^(\d+)\.\s/,
  replace: (parentNode) => {
    const listNode = $createListNode('number');
    const listItemNode = $createListItemNode();
    listNode.append(listItemNode);

    if ($isParagraphNode(parentNode)) {
      parentNode.replace(listNode);
    }

    return listItemNode;
  },
  type: 'element',
};

// Code block: ```
export const CODE_BLOCK: ElementTransformer = {
  dependencies: [CodeNode],
  export: (node: LexicalNode) => {
    if (!$isCodeNode(node)) {
      return null;
    }
    const textContent = node.getTextContent();
    return '```\n' + textContent + '\n```';
  },
  regExp: /^```(\w+)?\s/,
  replace: (parentNode) => {
    const codeNode = $createCodeNode();
    parentNode.replace(codeNode);
    return codeNode;
  },
  type: 'element',
};

/**
 * All transformers combined
 */
export const MARKDOWN_TRANSFORMERS: Transformer[] = [
  // Inline formatting
  BOLD,
  BOLD_UNDERSCORE,
  ITALIC,
  ITALIC_UNDERSCORE,
  STRIKETHROUGH,
  INLINE_CODE,

  // Block-level
  HEADING,
  QUOTE,
  UNORDERED_LIST,
  ORDERED_LIST,
  CODE_BLOCK,
];

/**
 * Inline-only transformers (for contexts where block changes aren't wanted)
 */
export const INLINE_TRANSFORMERS: TextFormatTransformer[] = [
  BOLD,
  BOLD_UNDERSCORE,
  ITALIC,
  ITALIC_UNDERSCORE,
  STRIKETHROUGH,
  INLINE_CODE,
];

/**
 * Block-only transformers
 */
export const BLOCK_TRANSFORMERS: ElementTransformer[] = [
  HEADING,
  QUOTE,
  UNORDERED_LIST,
  ORDERED_LIST,
  CODE_BLOCK,
];
