/**
 * Editor V2 — Pure state transitions. No DOM. No selection reading.
 */

import type { EditorState, Node, NodeID } from './model';
import { generateId } from './model';
import {
  findNodeIndex,
  getPreviousNode,
  getNextNode,
  getDepth,
  getSubtreeRange,
} from './utils';

export type Action =
  | { type: 'SET_CURSOR'; nodeId: NodeID; offset: number }
  | { type: 'UPDATE_TEXT'; nodeId: NodeID; text: string }
  | { type: 'ENTER'; atNodeId?: NodeID; atOffset?: number }
  | { type: 'BACKSPACE'; atNodeId?: NodeID }
  | { type: 'MOVE_UP'; currentNodeId?: NodeID; currentOffset?: number }
  | { type: 'MOVE_DOWN'; currentNodeId?: NodeID; currentOffset?: number }
  | { type: 'INDENT'; atNodeId?: NodeID }
  | { type: 'OUTDENT'; atNodeId?: NodeID }
  | { type: 'TOGGLE_COLLAPSE'; nodeId: NodeID };

function clampOffset(offset: number, text: string): number {
  return Math.max(0, Math.min(offset, text.length));
}

const __DEV__ =
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

function enforceEditorInvariants(nodes: Node[]): Node[] {
  let next = [...nodes];

  // 1️⃣ Ensure at least one root node exists
  const hasRoot = next.some((n) => n.parentId === null);
  if (!hasRoot) {
    next.push({
      id: generateId(),
      text: '',
      parentId: null,
    });
    return next;
  }

  // 2️⃣ Ensure last root node is empty (systemic empty)
  const rootNodes = next.filter((n) => n.parentId === null);
  const lastRoot = rootNodes[rootNodes.length - 1];
  if (!lastRoot) return next;

  if (lastRoot.text.trim() !== '') {
    next.push({
      id: generateId(),
      text: '',
      parentId: null,
    });
  }

  return next;
}

function reduce(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'SET_CURSOR': {
      const idx = findNodeIndex(state.nodes, action.nodeId);
      if (idx < 0) return state;
      const node = state.nodes[idx];
      if (!node) return state;
      const offset = clampOffset(action.offset, node.text);
      return {
        ...state,
        cursor: { nodeId: action.nodeId, offset },
      };
    }

    case 'UPDATE_TEXT': {
      const idx = findNodeIndex(state.nodes, action.nodeId);
      if (idx < 0) return state;
      const nodes = state.nodes.map((n) =>
        n.id === action.nodeId ? { ...n, text: action.text } : n
      );
      return { ...state, nodes };
    }

    case 'ENTER': {
      const nodeId = action.atNodeId ?? state.cursor.nodeId;
      const idx = findNodeIndex(state.nodes, nodeId);
      if (idx < 0) return state;

      const node = state.nodes[idx];
      if (!node) return state;

      const offset =
        action.atOffset !== undefined
          ? clampOffset(action.atOffset, node.text)
          : clampOffset(state.cursor.offset, node.text);

      const isEmpty = node.text.length === 0;
      const isAtStart = offset === 0;
      const isAtEnd = offset === node.text.length;

      const newId = generateId();

      // EMPTY NODE → BELOW (after subtree)
      if (isEmpty) {
        const newNode: Node = {
          id: newId,
          text: '',
          parentId: node.parentId,
        };

        const { end } = getSubtreeRange(state.nodes, idx);
        const nodes = [
          ...state.nodes.slice(0, end + 1),
          newNode,
          ...state.nodes.slice(end + 1),
        ];

        return {
          ...state,
          nodes,
          cursor: { nodeId: newId, offset: 0 },
        };
      }

      // CURSOR AT END → BELOW (after subtree)
      if (isAtEnd) {
        const newNode: Node = {
          id: newId,
          text: '',
          parentId: node.parentId,
        };

        const { end } = getSubtreeRange(state.nodes, idx);
        const nodes = [
          ...state.nodes.slice(0, end + 1),
          newNode,
          ...state.nodes.slice(end + 1),
        ];

        return {
          ...state,
          nodes,
          cursor: { nodeId: newId, offset: 0 },
        };
      }

      // CURSOR AT START WITH CONTENT → ABOVE
      if (isAtStart) {
        const newNode: Node = {
          id: newId,
          text: '',
          parentId: node.parentId,
        };

        const nodes = [
          ...state.nodes.slice(0, idx),
          newNode,
          ...state.nodes.slice(idx),
        ];

        return {
          ...state,
          nodes,
          cursor: { nodeId: newId, offset: 0 },
        };
      }

      // SPLIT (created node after subtree)
      const head = node.text.slice(0, offset);
      const tail = node.text.slice(offset);

      const updated: Node = { ...node, text: head };
      const created: Node = {
        id: newId,
        text: tail,
        parentId: node.parentId,
      };

      const { start, end } = getSubtreeRange(state.nodes, idx);
      const nodes = [
        ...state.nodes.slice(0, start),
        updated,
        ...state.nodes.slice(start + 1, end + 1),
        created,
        ...state.nodes.slice(end + 1),
      ];

      return {
        ...state,
        nodes,
        cursor: { nodeId: newId, offset: 0 },
      };
    }

    case 'BACKSPACE': {
      const nodeId = action.atNodeId ?? state.cursor.nodeId;
      const idx = findNodeIndex(state.nodes, nodeId);
      if (idx <= 0) return state;
      const prev = getPreviousNode(state.nodes, idx);
      const curr = state.nodes[idx];
      if (!prev || !curr) return state;
      const mergedText = prev.text + curr.text;
      const boundaryOffset = prev.text.length;
      const nodes = state.nodes.filter((n) => n.id !== curr.id);
      const updatedNodes = nodes.map((n) =>
        n.id === prev.id ? { ...n, text: mergedText } : n
      );
      return {
        ...state,
        nodes: updatedNodes,
        cursor: { nodeId: prev.id, offset: boundaryOffset },
      };
    }

    case 'MOVE_UP': {
      const nodeId = action.currentNodeId ?? state.cursor.nodeId;
      const idx = findNodeIndex(state.nodes, nodeId);
      if (idx <= 0) return state;
      const prev = getPreviousNode(state.nodes, idx);
      if (!prev) return state;
      const offset =
        action.currentOffset !== undefined
          ? clampOffset(action.currentOffset, prev.text)
          : clampOffset(state.cursor.offset, prev.text);
      return {
        ...state,
        cursor: { nodeId: prev.id, offset },
      };
    }

    case 'MOVE_DOWN': {
      const nodeId = action.currentNodeId ?? state.cursor.nodeId;
      const idx = findNodeIndex(state.nodes, nodeId);
      const next = getNextNode(state.nodes, idx);
      if (!next) return state;
      const offset =
        action.currentOffset !== undefined
          ? clampOffset(action.currentOffset, next.text)
          : clampOffset(state.cursor.offset, next.text);
      return {
        ...state,
        cursor: { nodeId: next.id, offset },
      };
    }

    case 'INDENT': {
      const nodeId = action.atNodeId ?? state.cursor.nodeId;
      const idx = findNodeIndex(state.nodes, nodeId);
      if (idx <= 0) return state;

      const currentDepth = getDepth(state.nodes, nodeId);

      // Find nearest previous node at SAME depth
      let targetParent: Node | null = null;

      for (let i = idx - 1; i >= 0; i--) {
        const candidate = state.nodes[i];
        if (!candidate) continue;

        const candidateDepth = getDepth(state.nodes, candidate.id);

        if (candidateDepth === currentDepth) {
          targetParent = candidate;
          break;
        }
      }

      if (!targetParent) return state;

      const parentId = targetParent.id;

      // Get entire subtree block
      const { start, end } = getSubtreeRange(state.nodes, idx);
      const block = state.nodes.slice(start, end + 1);

      // Update ONLY root of block parentId
      const updatedBlock = block.map((n, i) =>
        i === 0 ? { ...n, parentId } : n
      );

      // Rebuild nodes WITHOUT reordering
      const newNodes = [
        ...state.nodes.slice(0, start),
        ...updatedBlock,
        ...state.nodes.slice(end + 1),
      ];

      // When moving into a parent, expand it so the moved node is visible
      const newCollapsed = new Set(state.collapsed ?? []);
      if (parentId) newCollapsed.delete(parentId);
      return { ...state, nodes: newNodes, collapsed: newCollapsed };
    }

    case 'OUTDENT': {
      const nodeId = action.atNodeId ?? state.cursor.nodeId;
      const idx = findNodeIndex(state.nodes, nodeId);
      if (idx < 0) return state;

      const node = state.nodes[idx];
      if (!node?.parentId) return state;

      const currentDepth = getDepth(state.nodes, nodeId);

      const parent = state.nodes.find((n) => n.id === node.parentId);
      if (!parent) return state;

      const newParentId = parent.parentId ?? null;

      const nodes = [...state.nodes];

      // Step 1: Move current node up one level
      nodes[idx] = { ...node, parentId: newParentId };

      // Step 2: Capture following siblings at same depth (use original depths)
      for (let i = idx + 1; i < nodes.length; i++) {
        const candidate = nodes[i];
        if (!candidate) break;

        const candidateDepth = getDepth(state.nodes, candidate.id);

        if (candidateDepth < currentDepth) break;

        if (candidateDepth === currentDepth) {
          nodes[i] = { ...candidate, parentId: nodeId };
        }
      }

      // When moving into a parent (grandparent), expand it so the moved node is visible
      const newCollapsed = new Set(state.collapsed ?? []);
      if (newParentId) newCollapsed.delete(newParentId);
      return { ...state, nodes, collapsed: newCollapsed };
    }

    case 'TOGGLE_COLLAPSE': {
      const next = new Set(state.collapsed ?? []);
      if (next.has(action.nodeId)) next.delete(action.nodeId);
      else next.add(action.nodeId);
      return { ...state, collapsed: next };
    }

    default:
      return state;
  }
}

export function reducer(state: EditorState, action: Action): EditorState {
  const nextState = reduce(state, action);
  const nodesWithInvariant = enforceEditorInvariants(nextState.nodes);
  if (__DEV__) {
    const ids = nodesWithInvariant.map((n) => n.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error('Duplicate node IDs detected');
    }
  }
  return { ...nextState, nodes: nodesWithInvariant };
}
