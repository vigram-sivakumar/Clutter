/**
 * 🔒 EDITOR MODEL — Canonical Document State (Non-React)
 *
 * CRITICAL PRINCIPLE:
 * The model is the source of truth.
 * React state is a VIEW of the model.
 *
 * PHASE SEPARATION:
 * - Phase A (Typing): DOM mutates, model untouched
 * - Phase B (Debounce): Model updates, React untouched
 * - Phase C (Structural): Model → React sync, DOM rebuild
 *
 * This prevents React re-renders during typing + debounce.
 */

import type {
  Node,
  NodeID,
  Segment,
  CursorPosition,
} from '../engine/NodeKernel';

/**
 * The canonical document model (NON-REACT)
 */
interface EditorModel {
  nodes: Node[];
  cursor: CursorPosition;
  // Add other document state as needed
}

/**
 * The singleton model instance
 */
let model: EditorModel | null = null;

/**
 * Initialize the model with initial state
 */
export function initializeModel(nodes: Node[], cursor: CursorPosition): void {
  model = { nodes, cursor };
}

/**
 * Get the current model state (read-only)
 */
export function getModel(): Readonly<EditorModel> {
  if (!model) {
    throw new Error('EditorModel not initialized');
  }
  return model;
}

/**
 * Update nodes in the model (NO React state change)
 * This is called during debounce flush to sync segments
 */
export function updateModelNodes(nodes: Node[]): void {
  if (!model) {
    // Model not initialized yet - initialize it with current state
    model = {
      nodes,
      cursor: { nodeId: nodes[0]?.id || '', segmentIndex: 0, offset: 0 },
    };
    return;
  }

  model = { ...model, nodes };
}

/**
 * Update cursor in the model (NO React state change)
 */
export function updateModelCursor(cursor: CursorPosition): void {
  if (!model) {
    // Model not initialized yet - skip cursor-only update
    return;
  }

  model = { ...model, cursor };
}

/**
 * Update both nodes and cursor atomically
 */
export function updateModel(nodes: Node[], cursor: CursorPosition): void {
  // Always update model, initialize if needed
  model = { nodes, cursor };
}

/**
 * Get a specific node by ID from the model
 */
export function getModelNode(nodeId: NodeID): Node | undefined {
  if (!model) {
    return undefined; // Return undefined if model not ready (fallback to React state)
  }

  return model.nodes.find((n) => n.id === nodeId);
}

/**
 * Get all nodes from the model
 */
export function getModelNodes(): readonly Node[] {
  if (!model) {
    throw new Error('EditorModel not initialized');
  }

  return model.nodes;
}

/**
 * Get cursor from the model (with fallback)
 */
export function getModelCursor(): CursorPosition | null {
  if (!model) {
    return null; // Return null if model not ready (fallback to React state)
  }

  return model.cursor;
}

/**
 * Check if model is initialized
 */
export function isModelInitialized(): boolean {
  return model !== null;
}

// Global declaration for __DEV__
declare const __DEV__: boolean;
