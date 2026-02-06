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
 * Node types — rendering hints, not behavior
 */
export type NodeType = 'paragraph' | 'heading';

/**
 * Node — The fundamental unit
 */
export interface Node {
  /** Unique identifier */
  id: NodeID;

  /** Node type (affects rendering, not structure) */
  type: NodeType;

  /** Text content */
  text: string;

  /** Parent node ID (null = root) — hierarchy */
  parentId: NodeID | null;

  /** Properties (key-value metadata) — Phase 10 */
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
 */
export function splitNode(node: Node, offset: number): [Node, Node] {
  const beforeText = node.text.substring(0, offset);
  const afterText = node.text.substring(offset);

  // Original node keeps the before text
  const beforeNode: Node = { ...node, text: beforeText };

  // New node gets after text, inherits type and parent
  const afterNode: Node = createNode(node.type, afterText, node.parentId);

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
