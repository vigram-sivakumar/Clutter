/**
 * NodeKernel — Pure Data Structure & Transformations
 *
 * Framework-agnostic. No React. No DOM.
 * Just pure functions that transform node arrays.
 *
 * Inspired by Workflowy / Tana — nodes are first-class entities.
 * 
 * SEGMENTED ARCHITECTURE:
 * - Adding Segment type for Tana-style segmented content model
 * - Node now has segments[] (text + inline elements as discrete units)
 * - Legacy text + meta[] kept temporarily for dual-mode migration
 */

// InlineMetadata deleted - segments only architecture

export type NodeID = string;

/**
 * SEGMENTED ARCHITECTURE — Core Types
 * 
 * Segments replace the zero-width inline metadata model.
 * Text and inline elements are discrete, atomic units.
 */

/**
 * Segment — Text or inline element
 * This is the foundational unit of the segmented architecture.
 */
export type Segment =
  | { type: "text"; text: string }
  | { type: "inline"; kind: "ref"; id: string; payload: any };

// Old Node interface deleted - segments only architecture

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
}

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
 * Split a node at a position
 * Returns [beforeNode, afterNode]
 * 
 * SEGMENTED ARCHITECTURE ONLY
 * - Uses splitNodeSegmented() - segments only
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
  return splitNodeSegmented(node, cursor);
}

/**
 * Merge two nodes (typically when backspacing at start of second node)
 * Returns the merged node
 * 
 * SEGMENTED ARCHITECTURE ONLY
 * - Uses mergeNodesSegmented() - segments only
 * - Upper node ID preserved (continuity)
 * - Segments concatenated
 * - Variant from first node wins
 */
export function mergeNodes(first: Node, second: Node): Node {
  return mergeNodesSegmented(first, second);
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
 * Phase 09 — Reference Helpers (File 09)
 * Pure functions for managing node.props.references
 */

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

// migrateNodeToSegments deleted - all nodes must already have segments

/**
 * SEGMENTED ARCHITECTURE — Split Operation
 * 
 * Splits node at cursor position using segments.
 * Inline segments are atomic (never split).
 * 
 * Algorithm (EXACT):
 * - If cursor inside text segment and offset is mid-text → split that text segment
 * - Otherwise → split at segment boundary (inline segments atomic)
 * - Original node ID preserved in beforeNode
 * - New ID for afterNode
 */
export function splitNodeSegmented(
  node: Node,
  cursor: { nodeId: string; segmentIndex: number; offset: number }
): [Node, Node] {
  // Segments are now mandatory - empty nodes still have segments: []
  if (node.segments.length === 0) {
    // Empty node - both nodes stay empty
    return [
      { ...node, segments: [] },
      { ...node, id: generateNodeId(), segments: [] }
    ];
  }

  const segmentIndex = cursor.segmentIndex;
  const offset = cursor.offset;
  
  if (segmentIndex < 0 || segmentIndex >= node.segments.length) {
    // Invalid index - split at end
    return [
      { ...node, segments: [...node.segments] },
      { ...node, id: generateNodeId(), segments: [] }
    ];
  }
  
  const segment = node.segments[segmentIndex];
  
  if (segment && segment.type === "text" && offset > 0 && offset < segment.text.length) {
    // Split text segment at offset
    const beforeSegments = [
      ...node.segments.slice(0, segmentIndex),
      { type: "text" as const, text: segment.text.slice(0, offset) }
    ];
    
    const afterSegments = [
      { type: "text" as const, text: segment.text.slice(offset) },
      ...node.segments.slice(segmentIndex + 1)
    ];
    
    return [
      { ...node, segments: beforeSegments },
      { ...node, id: generateNodeId(), segments: afterSegments }
    ];
  } else {
    // Split at segment boundary (inline segments are atomic)
    const beforeSegments = node.segments.slice(0, segmentIndex + 1);
    const afterSegments = node.segments.slice(segmentIndex + 1);
    
    return [
      { ...node, segments: beforeSegments },
      { ...node, id: generateNodeId(), segments: afterSegments }
    ];
  }
}

/**
 * SEGMENTED ARCHITECTURE — Merge Operation
 * 
 * Merges two nodes by concatenating their segments.
 * Never merges inline segments or collapses text automatically.
 * 
 * Algorithm (EXACT):
 * - Upper node ID preserved (continuity)
 * - Segments concatenated: [...upper.segments, ...lower.segments]
 * - Variant from upper node wins
 */
export function mergeNodesSegmented(upper: Node, lower: Node): Node {
  // Segments are now mandatory - always concatenate them
  const mergedSegments = [
    ...upper.segments,
    ...lower.segments
  ];
  
  return {
    ...upper,
    segments: mergedSegments,
    // Preserve upper node's variant
    props: {
      ...upper.props,
      ...(upper.props?.variant || lower.props?.variant 
        ? { variant: (upper.props?.variant || lower.props?.variant) as string }
        : {})
    }
  };
}
