/**
 * NodeKernel — THE SOURCE OF TRUTH
 *
 * This is the core data structure for a node-based outliner.
 * Inspired by Tana / Workflowy — nodes are first-class entities.
 *
 * No rendering. No DOM. No editor logic.
 * Just pure data structure.
 */

export type NodeID = string;

/**
 * Node — The fundamental unit
 *
 * Design principles:
 * - Every node can have children (tree structure)
 * - Nodes can be collapsed/expanded
 * - Text is just one property — nodes are not text editors
 * - No block types — rendering style is separate concern
 */
export interface Node {
  /** Unique identifier */
  id: NodeID;

  /** Parent node ID (null = root level) */
  parentId: NodeID | null;

  /** Ordered list of child node IDs */
  children: NodeID[];

  /** Node content (plain text for now) */
  text: string;

  /** Whether this node's children are hidden */
  collapsed: boolean;
}

/**
 * Create a new node with defaults
 */
export function createNode(id: NodeID, parentId: NodeID | null = null): Node {
  return {
    id,
    parentId,
    children: [],
    text: '',
    collapsed: false,
  };
}
