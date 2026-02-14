// engine.ts
// Pure document model operations (no DOM, no React)

/**
 * UNIFIED ENGINE LAYER
 * 
 * All pure data operations for the editor.
 * No DOM access. No React. No side effects.
 * 
 * Merged from:
 * - EditorState.ts (types)
 * - NodeKernel.ts (node operations)
 * - SegmentUtils.ts (segment utilities)
 * - SegmentOps.ts (segment operations)
 * - SegmentQuery.ts (query operations)
 * - SegmentedEditor.ts (text editing)
 */

import { performGuaranteedSplit } from '../hardening/split-state-machine';
import { parseAllHashtags } from '../input/parseHashtag';

// ============================
// Types
// ============================

export type NodeID = string;

/**
 * Segment — Text or inline element
 * This is the foundational unit of the segmented architecture.
 */
export type Segment =
  | { type: "text"; text: string }
  | { type: "inline"; kind: "ref"; id: string; payload: any };

/**
 * SEGMENTED ARCHITECTURE — Cursor Position
 * 
 * NO BIAS. NO GLOBAL OFFSETS.
 * 
 * Cursor identifies:
 * - Which node
 * - Which segment (by index in segments array)
 * - Local offset inside that segment
 * 
 * Caret anchors make "before/after inline" explicit in DOM.
 * No calculation needed.
 */
export interface CursorPosition {
  nodeId: NodeID;
  segmentIndex: number;  // Which segment in node.segments[]
  offset: number;        // LOCAL offset inside that segment (0 for caret-anchor)
}

/**
 * Editor State - SEGMENTED ARCHITECTURE
 * 
 * Pure data structure. No behavior.
 * Cursor is observed from browser, not "intended".
 */
export interface EditorState {
  nodes: Node[];
  cursor: CursorPosition;
  selection?: {
    anchor: CursorPosition;
    focus: CursorPosition;
  };
}

/**
 * Node types — DEPRECATED, use props.variant instead
 * Kept for backward compatibility during migration
 */
export type NodeType = 'paragraph' | 'heading';

/**
 * Node variants (File 04) — Canonical set
 */
export type NodeVariant =
  | 'paragraph'
  | 'bullet'
  | 'task'
  | 'numbered'
  | 'heading-1'
  | 'heading-2'
  | 'callout';

/**
 * Reference — Semantic node relationship (File 09)
 * Stored in node.props.references, not as text or markdown
 */
export interface Reference {
  targetWorkspaceId: string;
  targetDocumentId: string;
  targetNodeId: NodeID;
}

/**
 * Node — The fundamental unit
 * 
 * SEGMENTED ARCHITECTURE MIGRATION (DUAL-MODE):
 * - segments[] is the NEW model (Tana-style)
 * - text + meta[] are TEMPORARY (legacy, READ-ONLY during migration)
 * - All NEW logic MUST use segments[]
 * - Legacy fields will be deleted after migration completes
 */
export interface Node {
  /** Unique identifier */
  id: NodeID;

  /** Node type (DEPRECATED — use props.variant) */
  type: NodeType;

  /** SEGMENTED ARCHITECTURE: Content as discrete segments (MANDATORY) */
  segments: Segment[];

  /** Parent node ID (null = root) — hierarchy */
  parentId: NodeID | null;

  /** Properties (key-value metadata) — Phase 10, File 04 */
  props?: Record<string, string>;

  /** References to other nodes — Phase 11 (graph edges) */
  refs?: NodeID[];
  
  /** Collapse state for tree rendering */
  isCollapsed?: boolean;
  
  /** Deletion flag (soft delete) */
  isDeleted?: boolean;

  /** Indent level (for tab/outdent) */
  indent?: number;
}

// ============================
// Node Operations
// ============================

/**
 * Generate unique node ID
 */
let nextId = 1;
export function generateNodeId(): NodeID {
  return `node-${nextId++}`;
}

/**
 * Create a new node with defaults
 * SEGMENTED ARCHITECTURE: Always creates segments
 */
export function createNode(
  type: NodeType = 'paragraph',
  text: string = '',
  parentId: NodeID | null = null
): Node {
  return {
    id: generateNodeId(),
    type,
    segments: text ? [{ type: "text", text }] : [],
    parentId,
    props: {
      variant: 'paragraph', // File 04 — Default variant
    },
  };
}

/**
 * Get node variant (File 04)
 * Returns variant from props, falling back to 'paragraph' if not set
 */
export function getNodeVariant(node: Node): NodeVariant {
  return (node.props?.variant as NodeVariant) || 'paragraph';
}

/**
 * Set node variant (File 04)
 * Returns new node with updated variant in props
 */
export function setNodeVariant(node: Node, variant: NodeVariant): Node {
  return {
    ...node,
    props: {
      ...node.props,
      variant,
    },
  };
}

/**
 * Insert a node after another node in the list
 */
export function insertNodeAfter(
  nodes: Node[],
  afterId: NodeID,
  newNode: Node
): Node[] {
  const index = nodes.findIndex((n) => n.id === afterId);
  if (index === -1) return [...nodes, newNode]; // Not found, append

  return [...nodes.slice(0, index + 1), newNode, ...nodes.slice(index + 1)];
}

/**
 * Insert a node before another node in the list
 */
export function insertNodeBefore(
  nodes: Node[],
  beforeId: NodeID,
  newNode: Node
): Node[] {
  const index = nodes.findIndex((n) => n.id === beforeId);
  if (index === -1) return [newNode, ...nodes]; // Not found, prepend

  return [...nodes.slice(0, index), newNode, ...nodes.slice(index)];
}

/**
 * Delete a node by ID
 */
export function deleteNode(nodes: Node[], nodeId: NodeID): Node[] {
  return nodes.filter((n) => n.id !== nodeId);
}

/**
 * Update node text
 */
export function updateNodeText(
  nodes: Node[],
  nodeId: NodeID,
  text: string
): Node[] {
  return nodes.map((n) => (n.id === nodeId ? { ...n, text } : n));
}

/**
 * Replace entire node (including props)
 * Use this when you need to update more than just text
 */
export function replaceNode(
  nodes: Node[],
  nodeId: NodeID,
  newNode: Node
): Node[] {
  return nodes.map((n) => (n.id === nodeId ? newNode : n));
}

/**
 * Find node index by ID
 */
export function findNodeIndex(nodes: Node[], nodeId: NodeID): number {
  return nodes.findIndex((n) => n.id === nodeId);
}

/**
 * Get previous node (if any)
 */
export function getPreviousNode(nodes: Node[], nodeId: NodeID): Node | null {
  const index = findNodeIndex(nodes, nodeId);
  if (index <= 0) return null;
  return nodes[index - 1] ?? null;
}

/**
 * Get next node (if any)
 */
export function getNextNode(nodes: Node[], nodeId: NodeID): Node | null {
  const index = findNodeIndex(nodes, nodeId);
  if (index === -1 || index >= nodes.length - 1) return null;
  return nodes[index + 1] ?? null;
}

/**
 * Get references from a node
 * Returns empty array if no references exist
 * PHASE 1: DISABLED (returning empty for stability)
 */
export function getReferences(node: Node): Reference[] {
  return []; // PHASE 1: References disabled
}

/**
 * Add a reference to a node
 * PHASE 1: DISABLED (no-op for stability)
 */
export function addReference(node: Node, reference: Reference): Node {
  return node; // PHASE 1: References disabled
}

/**
 * Remove reference at specific index
 * PHASE 1: DISABLED (no-op for stability)
 */
export function removeReferenceAt(node: Node, index: number): Node {
  return node; // PHASE 1: References disabled
}

/**
 * Check if node has any references
 */
export function hasReferences(node: Node): boolean {
  return getReferences(node).length > 0;
}

// ============================
// Segment Utilities
// ============================

/**
 * Reconstruct plain text from segments
 * 
 * This is the ONLY way to get plain text from segments.
 * Used by: grammar detection, queries, hashtags, search.
 * 
 * Inline elements contribute ZERO width (same as old model).
 */
export function getPlainText(segments: Segment[]): string {
  return segments
    .filter(s => s.type === "text")
    .map(s => s.text)
    .join("");
}

/**
 * Convert plain text offset to segment cursor
 * 
 * Used by: Grammar commit (after detection in plain text)
 * 
 * Returns { segmentIndex, offset } for the given global text offset.
 */
export function findSegmentAtPlainTextOffset(
  segments: Segment[],
  globalOffset: number
): { segmentIndex: number; offset: number } {
  let remaining = globalOffset;
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg && seg.type === "text") {
      const len = seg.text.length;
      if (remaining <= len) {
        return { segmentIndex: i, offset: remaining };
      }
      remaining -= len;
    }
  }
  
  // Beyond end - return last position
  return { segmentIndex: segments.length - 1, offset: 0 };
}

/**
 * Convert segment cursor to plain text offset
 * 
 * Used by: Grammar detection (to pass offset to existing detection logic)
 * 
 * Returns global text offset for the given segment cursor.
 */
export function getCursorOffsetInPlainText(
  segments: Segment[],
  cursor: { segmentIndex: number; offset: number }
): number {
  let globalOffset = 0;
  
  for (let i = 0; i < cursor.segmentIndex; i++) {
    const seg = segments[i];
    if (seg && seg.type === "text") {
      globalOffset += seg.text.length;
    }
  }
  
  return globalOffset + cursor.offset;
}

/**
 * Find inline elements by kind
 * 
 * Used by: Queries (/ref), reference resolution, backlink computation.
 * 
 * Returns all inline segments matching the given kind.
 */
export function getInlineElements<K extends string>(
  segments: Segment[],
  kind: K
): Segment[] {
  return segments.filter(
    s => s.type === "inline" && s.kind === kind
  );
}

// ============================
// Segment Operations
// ============================

export interface SplitResult {
  head: Node;
  tail: Node;
}

/**
 * Split node at segment cursor position
 * 
 * 🔒 SINGLE SOURCE OF TRUTH: Delegates to hardening layer's performGuaranteedSplit()
 * 
 * This ensures:
 * - Same logic for tests and production
 * - Automatic validation of content preservation
 * - Exhaustive case handling with compiler enforcement
 * - Impossible to introduce bugs through duplication
 */
export function splitNodeAtCursor(
  node: Node,
  segmentIndex: number,
  offset: number
): SplitResult {
  // Delegate to hardening layer - SINGLE implementation
  const cursor: CursorPosition = {
    nodeId: node.id,
    segmentIndex,
    offset,
  };
  
  const { head: headSegments, tail: tailSegments } = performGuaranteedSplit(
    node.segments,
    cursor
  );
  
  return {
    head: { ...node, segments: headSegments },
    tail: { ...node, id: generateNodeId(), segments: tailSegments }
  };
}

/**
 * Merge two nodes by concatenating segments
 * 
 * Upper node ID is preserved.
 * NO segment collapsing or text merging.
 */
export function mergeNodes(upper: Node, lower: Node): Node {
  return {
    ...upper,
    segments: [...upper.segments, ...lower.segments],
    props: {
      ...upper.props,
      ...(upper.props?.variant || lower.props?.variant 
        ? { variant: (upper.props?.variant || lower.props?.variant) as string }
        : {})
    }
  };
}

/**
 * Delete range within single text segment
 * 
 * Returns updated segment or null if segment should be removed.
 */
export function deleteInSegment(
  segment: Segment,
  start: number,
  end: number
): Segment | null {
  if (segment.type !== "text") {
    throw new Error("Cannot delete from non-text segment");
  }
  
  const newText = segment.text.slice(0, start) + segment.text.slice(end);
  
  if (newText.length === 0) {
    return null;
  }
  
  return { type: "text", text: newText };
}

/**
 * Insert text into text segment at offset
 */
export function insertInSegment(
  segment: Segment,
  offset: number,
  text: string
): Segment {
  if (segment.type !== "text") {
    throw new Error("Cannot insert into non-text segment");
  }
  
  return {
    type: "text",
    text: segment.text.slice(0, offset) + text + segment.text.slice(offset)
  };
}

/**
 * Replace segment at index in segments array
 */
export function replaceSegment(
  segments: Segment[],
  index: number,
  newSegment: Segment | null
): Segment[] {
  if (newSegment === null) {
    return [...segments.slice(0, index), ...segments.slice(index + 1)];
  }
  
  return [
    ...segments.slice(0, index),
    newSegment,
    ...segments.slice(index + 1)
  ];
}

/**
 * Split a node at a position
 * Returns [beforeNode, afterNode]
 * 
 * SEGMENTED ARCHITECTURE ONLY
 * - Uses splitNodeAtCursor() - segments only
 * - Original node ID preserved in beforeNode
 * - New ID generated for afterNode
 * - Variant preserved in both nodes
 */
export function splitNode(
  node: Node,
  offsetOrCursor: number | { offset: number; segmentIndex?: number }
): [Node, Node] {
  // Convert to cursor format
  const cursor = typeof offsetOrCursor === 'number' 
    ? { nodeId: node.id, segmentIndex: 0, offset: offsetOrCursor }
    : { 
        nodeId: node.id, 
        segmentIndex: offsetOrCursor.segmentIndex || 0, 
        offset: offsetOrCursor.offset 
      };
  
  // Use segmented split logic
  const { head, tail } = splitNodeAtCursor(node, cursor.segmentIndex, cursor.offset);
  return [head, tail];
}

// ============================
// Query Operations
// ============================

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

// ============================
// Text Editing Operations
// ============================

export interface EnterResult {
  head: Node;
  tail: Node;
  cursor: CursorPosition;
}

export interface BackspaceResult {
  node: Node;
  cursor: CursorPosition;
  shouldMergeWithPrevious?: boolean;
  mergeResult?: { merged: Node; cursor: CursorPosition };
  updated?: Node;
}

export interface InputResult {
  node: Node;
  cursor: CursorPosition;
}

/**
 * Handle Enter key press
 *
 * Implements MOVE-TAIL semantics:
 * - Original node keeps HEAD segments
 * - New node gets TAIL segments
 * - Cursor moves to new node at {segmentIndex: 0, offset: 0}
 */
export function handleSegmentedEnter(
  node: Node,
  cursor: CursorPosition
): EnterResult {
  const { segmentIndex, offset } = cursor;

  const { head, tail } = splitNodeAtCursor(node, segmentIndex, offset);

  return {
    head,
    tail,
    cursor: {
      nodeId: tail.id,
      segmentIndex: 0,
      offset: 0,
    },
  };
}

/**
 * Handle Backspace key press
 *
 * ONLY handles offset === 0 case (merge with previous node).
 * All other cases are handled by browser contenteditable.
 *
 * Returns:
 * - shouldMergeWithPrevious: true if cursor at start of node
 * - Otherwise returns unchanged node
 */
export function handleSegmentedBackspace(
  node: Node,
  cursor: CursorPosition,
  nodes?: Node[]
): BackspaceResult {
  const { segmentIndex, offset } = cursor;

  // At start of node → signal merge needed
  if (segmentIndex === 0 && offset === 0) {
    // If nodes array provided, perform merge immediately
    if (nodes) {
      const currentIndex = nodes.findIndex((n) => n.id === node.id);
      if (currentIndex > 0) {
        const prevNode = nodes[currentIndex - 1];
        if (prevNode) {
          const mergeResult = mergeWithPrevious(prevNode, node);
          return {
            node,
            cursor,
            mergeResult,
          };
        }
      }
    }
    
    return {
      node,
      cursor,
      shouldMergeWithPrevious: true,
    };
  }

  // Browser handles all other cases
  return {
    node,
    cursor,
    shouldMergeWithPrevious: false,
    updated: node,
  };
}

/**
 * Handle Delete key press
 *
 * ONLY handles offset === end of node case (merge with next node).
 * All other cases are handled by browser contenteditable.
 */
export function handleSegmentedDelete(
  node: Node,
  cursor: CursorPosition
): { node: Node; cursor: CursorPosition; shouldMergeWithNext: boolean } {
  const { segmentIndex, offset } = cursor;
  const segment = node.segments[segmentIndex];

  // At end of node → signal merge needed
  const isAtEnd =
    segmentIndex === node.segments.length - 1 &&
    segment?.type === 'text' &&
    offset === segment.text.length;

  if (isAtEnd || segmentIndex === node.segments.length) {
    return {
      node,
      cursor,
      shouldMergeWithNext: true,
    };
  }

  // Browser handles all other cases
  return {
    node,
    cursor,
    shouldMergeWithNext: false,
  };
}

/**
 * 🔒 NORMALIZE TEXT — Remove browser DOM artifacts
 *
 * Browsers insert \u00A0 (non-breaking space) into empty contenteditable elements.
 * This is a DOM caret helper, NOT content.
 *
 * Rules:
 * - \u00A0 → normal space
 * - Whitespace-only → empty string (no segment)
 * - Leading/trailing whitespace preserved for real text
 */
function normalizeText(text: string): string {
  // Convert NBSP to normal space
  const normalized = text.replace(/\u00A0/g, ' ');

  // Return empty string if only whitespace
  return normalized.trim().length === 0 ? '' : normalized;
}

/**
 * Sync node segments from DOM content
 *
 * This is called by input observer after DOM changes.
 * Reconstructs segments array from contenteditable DOM.
 *
 * MANDATORY: Preserve inline elements, update only text.
 */
export function handleSegmentedInput(
  node: Node,
  cursor: CursorPosition,
  dom: HTMLElement
): InputResult {
  // Get all child nodes from contenteditable
  const children = Array.from(dom.childNodes);
  const newSegments: typeof node.segments = [];

  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      const raw = child.textContent || '';
      const text = normalizeText(raw);

      // Only create segment if normalized text is non-empty
      if (text.length > 0) {
        newSegments.push({ type: 'text', text });
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const elem = child as HTMLElement;

      // Skip caret anchors
      if (elem.classList.contains('caret-anchor')) {
        continue;
      }

      // Preserve inline elements
      if (elem.classList.contains('inline-element')) {
        const inlineId = elem.dataset.inlineId;
        const kind =
          elem.className
            .split(' ')
            .find((c) => c.startsWith('inline-'))
            ?.replace('inline-', '') || 'ref';

        if (inlineId) {
          newSegments.push({
            type: 'inline',
            kind: kind as any,
            id: inlineId,
            payload: { type: 'reference', targetId: inlineId },
          });
        }
      }
    }
  }

  // Return updated segments (caller decides whether to buffer or commit)
  return {
    node: { ...node, segments: newSegments },
    cursor,
  };
}

/**
 * Merge current node with previous node
 *
 * Used after Backspace at start of node.
 * Returns merged node with cursor at junction point.
 */
export function mergeWithPrevious(
  previous: Node,
  current: Node
): { merged: Node; cursor: CursorPosition } {
  const merged = mergeNodes(previous, current);

  // 🔒 UNBREAKABLE: Cursor at junction = where current node's content starts
  // Junction is at index previous.segments.length
  // Place cursor EXACTLY at junction, even if it's an inline element
  // (Caret will be in the caret-anchor before the inline)
  
  const junctionIndex = previous.segments.length;
  
  // 🔒 CRITICAL FIX: When current is empty, junction = end of previous
  // Case 1: Current has segments -> cursor at junction (start of current's content)
  // Case 2: Current is empty -> cursor at junction (after previous's content)
  //         Even if junction = segments.length (after last segment)
  
  if (junctionIndex < merged.segments.length) {
    // Case 1: Junction points to a segment (current had content)
    return {
      merged,
      cursor: {
        nodeId: merged.id,
        segmentIndex: junctionIndex,
        offset: 0,
      },
    };
  }
  
  // Case 2: Junction is at/after the end (current was empty or at boundary)
  // Need to place cursor "after" the last segment
  const lastSegment = merged.segments[merged.segments.length - 1];
  
  if (!lastSegment) {
    // No segments at all - cursor at start
    return {
      merged,
      cursor: { nodeId: merged.id, segmentIndex: 0, offset: 0 }
    };
  }
  
  if (lastSegment.type === 'text') {
    // Last segment is text - cursor at end of text
    return {
      merged,
      cursor: {
        nodeId: merged.id,
        segmentIndex: merged.segments.length - 1,
        offset: lastSegment.text.length
      }
    };
  }
  
  // Last segment is inline - cursor "after" it (segmentIndex beyond array)
  return {
    merged,
    cursor: {
      nodeId: merged.id,
      segmentIndex: merged.segments.length, // One past the end = "after last segment"
      offset: 0
    }
  };
}

/**
 * Merge current node with next node
 *
 * Used after Delete at end of node.
 * Returns merged node with cursor at original position.
 */
export function mergeWithNext(
  current: Node,
  next: Node,
  cursor: CursorPosition
): { merged: Node; cursor: CursorPosition } {
  const merged = mergeNodes(current, next);

  return {
    merged,
    cursor: {
      ...cursor,
      nodeId: merged.id,
    },
  };
}
