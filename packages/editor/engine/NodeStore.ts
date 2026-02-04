/**
 * NodeStore — IN-MEMORY STATE MANAGEMENT
 *
 * This is a minimal in-memory store for nodes.
 * No persistence. No backend. No fancy state management.
 *
 * Just CRUD operations on a flat map of nodes.
 */

import { Node, NodeID, createNode } from './NodeKernel';

/**
 * Simple ID generator (not production-ready)
 */
let nextId = 1;
function generateId(): NodeID {
  return `node-${nextId++}`;
}

/**
 * NodeStore — Manages the node graph in memory
 */
export class NodeStore {
  private nodes: Map<NodeID, Node>;

  constructor() {
    this.nodes = new Map();
  }

  /**
   * Get a node by ID
   */
  getNode(id: NodeID): Node | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get all nodes
   */
  getAllNodes(): Node[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Create a new node
   *
   * @param afterId - Optional: insert after this sibling node
   * @returns The new node's ID
   */
  createNode(afterId?: NodeID): NodeID {
    const newId = generateId();

    // Determine parent and position
    let parentId: NodeID | null = null;
    let insertIndex = 0;

    if (afterId) {
      const afterNode = this.nodes.get(afterId);
      if (afterNode) {
        parentId = afterNode.parentId;

        // Find the parent and insert after the sibling
        if (parentId) {
          const parent = this.nodes.get(parentId);
          if (parent) {
            insertIndex = parent.children.indexOf(afterId) + 1;
          }
        }
      }
    }

    // Create the node
    const newNode = createNode(newId, parentId);
    this.nodes.set(newId, newNode);

    // Add to parent's children
    if (parentId) {
      const parent = this.nodes.get(parentId);
      if (parent) {
        parent.children.splice(insertIndex, 0, newId);
      }
    }

    return newId;
  }

  /**
   * Delete a node and all its descendants
   */
  deleteNode(id: NodeID): void {
    const node = this.nodes.get(id);
    if (!node) return;

    // Recursively delete children
    for (const childId of node.children) {
      this.deleteNode(childId);
    }

    // Remove from parent's children list
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.children = parent.children.filter((childId) => childId !== id);
      }
    }

    // Delete the node
    this.nodes.delete(id);
  }

  /**
   * Update node text
   */
  updateText(id: NodeID, text: string): void {
    const node = this.nodes.get(id);
    if (node) {
      node.text = text;
    }
  }

  /**
   * Toggle node collapsed state
   */
  toggleCollapsed(id: NodeID): void {
    const node = this.nodes.get(id);
    if (node) {
      node.collapsed = !node.collapsed;
    }
  }

  /**
   * Move a node to a new parent at a specific position
   */
  moveNode(id: NodeID, newParentId: NodeID | null, index: number): void {
    const node = this.nodes.get(id);
    if (!node) return;

    // Remove from old parent
    if (node.parentId) {
      const oldParent = this.nodes.get(node.parentId);
      if (oldParent) {
        oldParent.children = oldParent.children.filter(
          (childId) => childId !== id
        );
      }
    }

    // Update node's parent
    node.parentId = newParentId;

    // Add to new parent
    if (newParentId) {
      const newParent = this.nodes.get(newParentId);
      if (newParent) {
        newParent.children.splice(index, 0, id);
      }
    }
  }

  /**
   * Get root-level nodes
   */
  getRootNodes(): Node[] {
    return Array.from(this.nodes.values()).filter(
      (node) => node.parentId === null
    );
  }
}
