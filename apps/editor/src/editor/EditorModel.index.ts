/**
 * 🔒 EDITOR MODEL — Index-Based (NO NODE ID LOOKUPS)
 *
 * ARCHITECTURAL PRINCIPLE (Workflowy/Tana style):
 * - nodes[] array IS the structure (ordered, authoritative)
 * - cursor stores INDEX (not derived, not looked up)
 * - ALL mutations use index-based operations
 * - DOM order === array order (cannot diverge)
 * - nodeId is metadata ONLY (never used for structure)
 *
 * This eliminates insertion bugs FOREVER.
 */

import type { Node, Segment } from './engine';

/**
 * Index-based cursor (single source of truth)
 */
export interface IndexCursor {
  index: number; // Position in nodes[] array
  segmentIndex: number; // Position in node.segments[]
  offset: number; // Character offset in segment
}

/**
 * EditorModel Class (Index-Based)
 */
export class EditorModelIndex {
  private nodes: Node[];
  private cursor: IndexCursor;
  private readonly instanceId: string;

  constructor(initialNodes: Node[], initialCursor: IndexCursor) {
    this.nodes = initialNodes;
    this.cursor = initialCursor;
    this.instanceId = `model-idx-${Math.random().toString(36).slice(2, 11)}`;

    if (__DEV__) {
      this.assertInvariants();
    }
  }

  // ==================== GETTERS ====================

  /**
   * Get all nodes (ordered array)
   */
  getNodes(): readonly Node[] {
    return this.nodes;
  }

  /**
   * Get cursor (index-based)
   */
  getCursor(): IndexCursor {
    return this.cursor;
  }

  /**
   * Get node at cursor position
   */
  getActiveNode(): Node {
    const node = this.nodes[this.cursor.index];
    if (!node) {
      throw new Error(`Node at index ${this.cursor.index} not found`);
    }
    return node;
  }

  /**
   * Get node by ID (metadata lookup only, NOT for structure)
   */
  getNodeById(nodeId: string): Node | undefined {
    return this.nodes.find((n) => n.id === nodeId);
  }

  /**
   * Get index of node by ID (metadata lookup only)
   */
  getIndexById(nodeId: string): number {
    const index = this.nodes.findIndex((n) => n.id === nodeId);
    if (index === -1) {
      throw new Error(`Node ${nodeId} not found`);
    }
    return index;
  }

  // ==================== MUTATIONS (INDEX-BASED ONLY) ====================

  /**
   * Insert node at index (structural operation)
   */
  insertNodeAt(index: number, node: Node): void {
    this.nodes = [
      ...this.nodes.slice(0, index),
      node,
      ...this.nodes.slice(index),
    ];

    if (__DEV__) {
      this.assertInvariants();
    }
  }

  /**
   * Replace node at index (structural operation)
   */
  replaceNodeAt(index: number, node: Node): void {
    if (index < 0 || index >= this.nodes.length) {
      throw new Error(`Invalid index: ${index}`);
    }

    this.nodes = [
      ...this.nodes.slice(0, index),
      node,
      ...this.nodes.slice(index + 1),
    ];

    if (__DEV__) {
      this.assertInvariants();
    }
  }

  /**
   * Delete node at index (structural operation)
   */
  deleteNodeAt(index: number): void {
    if (index < 0 || index >= this.nodes.length) {
      throw new Error(`Invalid index: ${index}`);
    }

    this.nodes = [
      ...this.nodes.slice(0, index),
      ...this.nodes.slice(index + 1),
    ];

    if (__DEV__) {
      this.assertInvariants();
    }
  }

  /**
   * Update segments at cursor position
   */
  updateSegmentsAtCursor(segments: Segment[]): void {
    const index = this.cursor.index;
    const node = this.nodes[index];

    if (!node) {
      throw new Error(`Node at cursor index ${index} not found`);
    }

    this.replaceNodeAt(index, { ...node, segments });
  }

  /**
   * Move cursor to index
   */
  moveCursor(
    index: number,
    segmentIndex: number = 0,
    offset: number = 0
  ): void {
    if (index < 0 || index >= this.nodes.length) {
      throw new Error(`Invalid cursor index: ${index}`);
    }

    this.cursor = { index, segmentIndex, offset };
  }

  /**
   * Update cursor position (atomic)
   */
  updateCursor(cursor: IndexCursor): void {
    if (cursor.index < 0 || cursor.index >= this.nodes.length) {
      throw new Error(`Invalid cursor index: ${cursor.index}`);
    }

    this.cursor = cursor;
  }

  /**
   * Update entire state (atomic)
   */
  updateState(nodes: Node[], cursor: IndexCursor): void {
    this.nodes = nodes;
    this.cursor = cursor;

    if (__DEV__) {
      this.assertInvariants();
    }
  }

  // ==================== INVARIANTS ====================

  private assertInvariants(): void {
    // Check cursor index is valid
    if (this.cursor.index < 0 || this.cursor.index >= this.nodes.length) {
      throw new Error(
        `INVARIANT VIOLATION: Cursor index ${this.cursor.index} out of bounds (0-${this.nodes.length - 1})`
      );
    }

    // Check all nodes have unique IDs
    const ids = new Set(this.nodes.map((n) => n.id));
    if (ids.size !== this.nodes.length) {
      throw new Error('INVARIANT VIOLATION: Duplicate node IDs');
    }

    // Check cursor segment index
    const node = this.nodes[this.cursor.index];
    if (
      this.cursor.segmentIndex < 0 ||
      this.cursor.segmentIndex > node.segments.length
    ) {
      throw new Error(
        `INVARIANT VIOLATION: Cursor segment index ${this.cursor.segmentIndex} out of bounds`
      );
    }
  }

  // ==================== CLEANUP ====================

  getInstanceId(): string {
    return this.instanceId;
  }

  destroy(): void {}
}

/**
 * Convert nodeId-based cursor to index-based cursor
 */
export function cursorToIndex(
  nodes: readonly Node[],
  nodeId: string,
  segmentIndex: number,
  offset: number
): IndexCursor {
  const index = nodes.findIndex((n) => n.id === nodeId);

  if (index === -1) {
    throw new Error(`Node ${nodeId} not found`);
  }

  return { index, segmentIndex, offset };
}

/**
 * Convert index-based cursor to nodeId (for legacy compatibility)
 */
export function cursorToNodeId(
  nodes: readonly Node[],
  cursor: IndexCursor
): { nodeId: string; segmentIndex: number; offset: number } {
  const node = nodes[cursor.index];

  if (!node) {
    throw new Error(`Node at index ${cursor.index} not found`);
  }

  return {
    nodeId: node.id,
    segmentIndex: cursor.segmentIndex,
    offset: cursor.offset,
  };
}

// Global declaration for __DEV__
declare const __DEV__: boolean;
