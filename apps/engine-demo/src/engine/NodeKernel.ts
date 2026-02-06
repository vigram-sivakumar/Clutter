/**
 * NodeKernel — Pure Data Structure & Transformations
 *
 * Framework-agnostic. No React. No DOM.
 * Just pure functions that transform node arrays.
 *
 * Inspired by Workflowy / Tana — nodes are first-class entities.
 */

export type NodeID = string;

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
 */
export interface Node {
  /** Unique identifier */
  id: NodeID;

  /** Node type (DEPRECATED — use props.variant) */
  type: NodeType;

  /** Text content */
  text: string;

  /** Parent node ID (null = root) — hierarchy */
  parentId: NodeID | null;

  /** Properties (key-value metadata) — Phase 10, File 04 */
  props?: Record<string, string>;

  /** References to other nodes — Phase 11 (graph edges) */
  refs?: NodeID[];
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
 */
export function createNode(
  type: NodeType = 'paragraph',
  text: string = '',
  parentId: NodeID | null = null
): Node {
  return {
    id: generateNodeId(),
    type,
    text,
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
 * Split a node at a position
 * Returns [beforeNode, afterNode]
 * File 04 — Variant is sticky (preserved on split)
 */
export function splitNode(node: Node, offset: number): [Node, Node] {
  const beforeText = node.text.substring(0, offset);
  const afterText = node.text.substring(offset);

  // Original node keeps the before text
  const beforeNode: Node = { ...node, text: beforeText };

  // New node gets after text, inherits type, parent, and variant
  const afterNode: Node = createNode(node.type, afterText, node.parentId);

  // Phase 09 Fix — Only copy variant, NOT references or other semantic props
  // File 09: References stay with original node, never duplicated on split
  const variant = node.props?.variant;
  afterNode.props = variant ? { variant } : {};

  return [beforeNode, afterNode];
}

/**
 * Merge two nodes (typically when backspacing at start of second node)
 * Returns the merged node
 */
export function mergeNodes(first: Node, second: Node): Node {
  return {
    ...first,
    text: first.text + second.text,
  };
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
 */
export function getReferences(node: Node): Reference[] {
  if (!node.props || !node.props.references) return [];

  try {
    const refs = node.props.references;
    // Handle both string (JSON) and object storage
    if (typeof refs === 'string') {
      return JSON.parse(refs) as Reference[];
    }
    return refs as unknown as Reference[];
  } catch {
    return [];
  }
}

/**
 * Add a reference to a node
 * Returns new node (immutable)
 */
export function addReference(node: Node, reference: Reference): Node {
  const existingRefs = getReferences(node);
  const newRefs = [...existingRefs, reference];

  return {
    ...node,
    props: {
      ...node.props,
      references: JSON.stringify(newRefs),
    },
  };
}

/**
 * Remove reference at specific index
 * Returns new node (immutable)
 */
export function removeReferenceAt(node: Node, index: number): Node {
  const existingRefs = getReferences(node);
  if (index < 0 || index >= existingRefs.length) return node;

  const newRefs = existingRefs.filter((_, i) => i !== index);

  // If no references left, remove the key entirely
  if (newRefs.length === 0) {
    const { references, ...restProps } = node.props || {};
    return {
      ...node,
      props: restProps,
    };
  }

  return {
    ...node,
    props: {
      ...node.props,
      references: JSON.stringify(newRefs),
    },
  };
}

/**
 * Check if node has any references
 */
export function hasReferences(node: Node): boolean {
  return getReferences(node).length > 0;
}
