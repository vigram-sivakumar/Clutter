/**
 * Lexical Node Registry
 *
 * All nodes that can be used in block editors.
 * Registers nodes for rich text formatting.
 */

import type { Klass, LexicalNode } from 'lexical';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { CodeNode } from '@lexical/code';
import { LinkNode, AutoLinkNode } from '@lexical/link';
import { ListNode, ListItemNode } from '@lexical/list';

/**
 * Get all nodes for the block editor
 */
export function getEditorNodes(): Array<Klass<LexicalNode>> {
  return [
    HeadingNode,
    QuoteNode,
    CodeNode,
    LinkNode,
    AutoLinkNode,
    ListNode,
    ListItemNode,
  ];
}
