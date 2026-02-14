/**
 * SEGMENT QUERY LAYER - READ-ONLY OPERATIONS
 * 
 * All query, search, grammar, and hashtag operations.
 * NO DOM ACCESS. NO STATE MUTATION.
 * 
 * These functions only READ segments, never modify them.
 */

import type { Node, Segment } from '../engine/NodeKernel';
import type { CursorPosition } from '../engine/EditorState';
import { getPlainText, getCursorOffsetInPlainText } from '../engine/SegmentUtils';
import { parseAllHashtags } from '../input/parseHashtag';

export interface GrammarMatch {
  type: 'command' | 'query' | 'hashtag' | 'reference';
  range: { from: number; to: number };
  text: string;
  commandName?: string;
}

export interface QueryMatch {
  type: 'text' | 'property' | 'type';
  matches: boolean;
}

/**
 * Detect grammar pattern at cursor position
 * 
 * Returns grammar match if cursor is inside a pattern:
 * - /command
 * - /query
 * - #hashtag
 * - [[reference]]
 */
export function matchGrammar(
  segments: Segment[],
  cursor: CursorPosition
): GrammarMatch | null {
  const plainText = getPlainText(segments);
  const offset = getCursorOffsetInPlainText(segments, cursor);
  
  // Look backwards from cursor for grammar triggers
  const textBeforeCursor = plainText.slice(0, offset);
  
  // Command pattern: /word
  const commandMatch = textBeforeCursor.match(/\/(\w+)$/);
  if (commandMatch) {
    const start = offset - commandMatch[0].length;
    return {
      type: 'command',
      range: { from: start, to: offset },
      text: commandMatch[0],
      commandName: commandMatch[1]
    };
  }
  
  // Query pattern: /word (for queries starting with /)
  const queryMatch = textBeforeCursor.match(/\/(\w+)\s+(.*)$/);
  if (queryMatch) {
    const start = offset - queryMatch[0].length;
    return {
      type: 'query',
      range: { from: start, to: offset },
      text: queryMatch[0]
    };
  }
  
  // Hashtag pattern: #key value
  const hashtagMatch = textBeforeCursor.match(/#(\w+)(?:\s+([^\s#]+))?$/);
  if (hashtagMatch) {
    const start = offset - hashtagMatch[0].length;
    return {
      type: 'hashtag',
      range: { from: start, to: offset },
      text: hashtagMatch[0]
    };
  }
  
  return null;
}

/**
 * Extract all hashtags from segments
 * 
 * Returns map of property key → value.
 * Used for syncing node.props.
 */
export function extractHashtags(segments: Segment[]): Record<string, string> {
  const plainText = getPlainText(segments);
  const hashtags = parseAllHashtags(plainText);
  
  const props: Record<string, string> = {};
  
  for (const tag of hashtags) {
    props[tag.key] = tag.value || '';
  }
  
  return props;
}

/**
 * Match node against query
 * 
 * Supports:
 * - text: substring match
 * - property: key match
 * - type: variant match
 */
export function matchQuery(
  node: Node,
  query: { type: 'text' | 'property' | 'type'; key?: string; value: string }
): boolean {
  switch (query.type) {
    case 'text': {
      const plainText = getPlainText(node.segments);
      return plainText.toLowerCase().includes(query.value.toLowerCase());
    }
    
    case 'property': {
      if (!node.props || !query.key) return false;
      if (!(query.key in node.props)) return false;
      
      // If value specified, match it
      if (query.value) {
        const propValue = node.props[query.key];
        return propValue ? propValue.toLowerCase().includes(query.value.toLowerCase()) : false;
      }
      
      return true;
    }
    
    case 'type': {
      const variant = node.props?.variant || 'paragraph';
      return variant === query.value;
    }
    
    default:
      return false;
  }
}

/**
 * Find all inline references in segments
 * 
 * Returns array of node IDs that this node references.
 */
export function extractReferences(segments: Segment[]): string[] {
  const refs: string[] = [];
  
  for (const seg of segments) {
    if (seg.type === 'inline' && seg.kind === 'ref') {
      refs.push(seg.id);
    }
  }
  
  return refs;
}

/**
 * Get word at cursor position
 * 
 * Used for autocomplete and word-based operations.
 */
export function getWordAtCursor(
  segments: Segment[],
  cursor: CursorPosition
): { word: string; start: number; end: number } | null {
  const plainText = getPlainText(segments);
  const offset = getCursorOffsetInPlainText(segments, cursor);
  
  // Word boundaries: whitespace, punctuation
  const wordPattern = /\w+/g;
  let match: RegExpExecArray | null;
  
  while ((match = wordPattern.exec(plainText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    
    if (offset >= start && offset <= end) {
      return {
        word: match[0],
        start,
        end
      };
    }
  }
  
  return null;
}

/**
 * Check if node is empty
 */
export function isNodeEmpty(node: Node): boolean {
  if (node.segments.length === 0) return true;
  
  const plainText = getPlainText(node.segments);
  return plainText.trim() === '';
}

/**
 * Get node label for UI display
 * 
 * Returns first line truncated to 50 chars.
 */
export function getNodeLabel(node: Node): string {
  const plainText = getPlainText(node.segments);
  
  if (!plainText || plainText.trim() === '') return '(empty)';
  
  const firstLine = plainText.split('\n')[0]?.trim();
  
  if (firstLine) {
    const maxLength = 50;
    return firstLine.length > maxLength
      ? firstLine.substring(0, maxLength) + '...'
      : firstLine;
  }
  
  return '(empty)';
}
