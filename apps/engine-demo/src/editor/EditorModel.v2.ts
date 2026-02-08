/**
 * 🔒 EDITOR MODEL — Instance-Based (NO SINGLETONS)
 * 
 * CRITICAL ARCHITECTURAL CHANGE:
 * - Each NodeEditor creates its OWN EditorModel instance
 * - No global state
 * - No shared module-level variables
 * - Multi-document isolation GUARANTEED
 * 
 * Usage:
 *   const modelRef = useRef(new EditorModel(initialNodes, initialCursor));
 */

import type { Node, CursorPosition } from '../engine/NodeKernel';

/**
 * EditorModel Class (Instance-Based)
 */
export class EditorModel {
  private nodes: readonly Node[];
  private cursor: CursorPosition;
  private readonly instanceId: string;

  constructor(initialNodes: readonly Node[], initialCursor: CursorPosition) {
    this.nodes = initialNodes;
    this.cursor = initialCursor;
    this.instanceId = `model-${Math.random().toString(36).slice(2, 11)}`;

    if (__DEV__) {
      console.log(`📚 EditorModel created: ${this.instanceId}`);
      
      // Store globally for dev assertion (detect sharing)
      if (!(globalThis as any).__editorModelInstances) {
        (globalThis as any).__editorModelInstances = new Set();
      }
      (globalThis as any).__editorModelInstances.add(this.instanceId);
    }
  }

  /**
   * Get current state (read-only)
   */
  getState(): { nodes: readonly Node[]; cursor: CursorPosition } {
    return {
      nodes: this.nodes,
      cursor: this.cursor,
    };
  }

  /**
   * Get nodes only
   */
  getNodes(): readonly Node[] {
    return this.nodes;
  }

  /**
   * Get cursor only
   */
  getCursor(): CursorPosition {
    return this.cursor;
  }

  /**
   * Get node by ID
   */
  getNode(nodeId: string): Node | undefined {
    return (this.nodes as Node[]).find(n => n.id === nodeId);
  }

  /**
   * Update entire state (nodes + cursor)
   */
  updateState(newNodes: readonly Node[], newCursor: CursorPosition): void {
    this.nodes = newNodes;
    this.cursor = newCursor;

    if (__DEV__) {
      console.log(`📚 EditorModel [${this.instanceId}]: State updated`, {
        nodeCount: newNodes.length,
        cursor: newCursor,
      });
    }
  }

  /**
   * Update nodes only
   */
  updateNodes(newNodes: readonly Node[]): void {
    this.nodes = newNodes;

    if (__DEV__) {
      console.log(`📚 EditorModel [${this.instanceId}]: Nodes updated`, {
        nodeCount: newNodes.length,
      });
    }
  }

  /**
   * Update cursor only
   */
  updateCursor(newCursor: CursorPosition): void {
    this.cursor = newCursor;

    if (__DEV__) {
      console.log(`📚 EditorModel [${this.instanceId}]: Cursor updated`, newCursor);
    }
  }

  /**
   * Get instance ID (for debugging)
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Destroy instance (cleanup)
   */
  destroy(): void {
    if (__DEV__) {
      console.log(`📚 EditorModel destroyed: ${this.instanceId}`);
      (globalThis as any).__editorModelInstances?.delete(this.instanceId);
    }
  }
}

/**
 * DEV ASSERTION: Detect if two editors share same model instance
 */
export function assertModelNotShared(model1: EditorModel, model2: EditorModel): void {
  if (__DEV__) {
    if (model1.getInstanceId() === model2.getInstanceId()) {
      throw new Error(
        `❌ ARCHITECTURAL VIOLATION: Two editors share the same EditorModel instance\n` +
        `Instance ID: ${model1.getInstanceId()}\n` +
        `Each editor MUST have its own EditorModel instance.\n` +
        `Use: const modelRef = useRef(new EditorModel(...));`
      );
    }
  }
}

// Global declaration for __DEV__
declare const __DEV__: boolean;
