/**
 * Clutter Engine — Node-Based Outliner
 *
 * Clean restart: No blocks, no Lexical, no document editor assumptions.
 *
 * Architecture:
 * - NodeKernel: Pure data structure (nodes + tree)
 * - NodeStore: In-memory state management
 * - NodePolicy: Structural keyboard behavior
 * - NodeView: Dumb recursive renderer
 *
 * Inspired by Tana / Workflowy — nodes first, formatting later.
 */

export { Node, NodeID, createNode } from './NodeKernel';
export { NodeStore } from './NodeStore';
export { NodePolicy } from './NodePolicy';
export { NodeView, RootView } from './NodeView';
