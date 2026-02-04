/**
 * NodePolicy — STRUCTURAL KEYBOARD BEHAVIOR
 *
 * This replaces the old "Enter / Backspace logic" from document editors.
 *
 * Critical differences:
 * - Policy is STRUCTURAL (creates/deletes/merges nodes)
 * - Cursor offset is METADATA (tells us where we are in the text)
 * - No DOM decisions here
 * - No contenteditable assumptions
 *
 * This is the "algebra" of node operations.
 */

import { NodeID, Node } from './NodeKernel';
import { NodeStore } from './NodeStore';

export interface NodePolicyConfig {
  store: NodeStore;
}

/**
 * NodePolicy — Defines structural keyboard behavior
 */
export class NodePolicy {
  private store: NodeStore;

  constructor(config: NodePolicyConfig) {
    this.store = config.store;
  }

  /**
   * Handle Enter key
   *
   * Behavior (Workflowy-style):
   * - If cursor is at end of text: create new sibling below
   * - If cursor is in middle: split text into two nodes
   * - If text is empty: outdent (move up one level)
   */
  onEnter(nodeId: NodeID, cursorOffset: number): void {
    const node = this.store.getNode(nodeId);
    if (!node) return;

    const textLength = node.text.length;

    // Case 1: Empty node → outdent (TODO: implement outdent)
    if (textLength === 0) {
      // For now, just create a sibling
      this.store.createNode(nodeId);
      return;
    }

    // Case 2: Cursor at end → create new sibling
    if (cursorOffset >= textLength) {
      this.store.createNode(nodeId);
      return;
    }

    // Case 3: Cursor in middle → split node
    const beforeText = node.text.substring(0, cursorOffset);
    const afterText = node.text.substring(cursorOffset);

    // Update current node with "before" text
    this.store.updateText(nodeId, beforeText);

    // Create new sibling with "after" text
    const newNodeId = this.store.createNode(nodeId);
    this.store.updateText(newNodeId, afterText);
  }

  /**
   * Handle Backspace key
   *
   * Behavior (Workflowy-style):
   * - If cursor is at start and text is empty: delete node
   * - If cursor is at start and text exists: merge with previous sibling
   * - Otherwise: let text editor handle (delete character)
   */
  onBackspace(nodeId: NodeID, cursorOffset: number): boolean {
    const node = this.store.getNode(nodeId);
    if (!node) return false;

    // Only handle structural cases (cursor at start)
    if (cursorOffset !== 0) {
      return false; // Let text editor handle
    }

    const textLength = node.text.length;

    // Case 1: Empty node at start → delete node
    if (textLength === 0) {
      this.store.deleteNode(nodeId);
      return true; // Handled structurally
    }

    // Case 2: Non-empty node at start → merge with previous sibling
    // TODO: Implement sibling finding and merging
    // For now, do nothing
    return false;
  }

  /**
   * Handle Tab key (indent)
   *
   * Makes current node a child of previous sibling
   */
  onTab(nodeId: NodeID): void {
    const node = this.store.getNode(nodeId);
    if (!node) return;

    // Find previous sibling
    if (node.parentId) {
      const parent = this.store.getNode(node.parentId);
      if (!parent) return;

      const siblingIndex = parent.children.indexOf(nodeId);
      if (siblingIndex > 0) {
        const prevSiblingId = parent.children[siblingIndex - 1];

        // Move node to be child of previous sibling
        this.store.moveNode(nodeId, prevSiblingId, 0);
      }
    }
  }

  /**
   * Handle Shift+Tab (outdent)
   *
   * Makes current node a sibling of its parent
   */
  onShiftTab(nodeId: NodeID): void {
    const node = this.store.getNode(nodeId);
    if (!node || !node.parentId) return;

    const parent = this.store.getNode(node.parentId);
    if (!parent) return;

    // Find parent's position in grandparent
    const grandparentId = parent.parentId;

    if (grandparentId) {
      const grandparent = this.store.getNode(grandparentId);
      if (!grandparent) return;

      const parentIndex = grandparent.children.indexOf(node.parentId);

      // Move node to be sibling of parent (right after parent)
      this.store.moveNode(nodeId, grandparentId, parentIndex + 1);
    } else {
      // Parent is root-level, move to root
      this.store.moveNode(nodeId, null, 0);
    }
  }
}
