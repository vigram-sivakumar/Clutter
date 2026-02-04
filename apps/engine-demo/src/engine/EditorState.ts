import {
  Node,
  NodeID,
  updateNodeText,
  getPreviousNode,
  getNextNode,
  splitNode,
  insertNodeAfter,
  createNode,
  mergeNodes,
  deleteNode,
} from './NodeKernel';

export interface EditorState {
  nodes: Node[];
  activeNodeId: NodeID;
  offset: number; // cursor position inside active node
}

export type EditorIntent =
  | { type: 'insertText'; text: string }
  | { type: 'enter' }
  | { type: 'backspace' }
  | { type: 'moveUp' }
  | { type: 'moveDown' };

export function applyIntent(
  state: EditorState,
  intent: EditorIntent
): EditorState {
  switch (intent.type) {
    case 'insertText': {
      const { nodes, activeNodeId, offset } = state;
      const node = nodes.find((n) => n.id === activeNodeId);
      if (!node) return state;

      const before = node.text.slice(0, offset);
      const after = node.text.slice(offset);

      const updatedText = before + intent.text + after;

      return {
        nodes: updateNodeText(nodes, activeNodeId, updatedText),
        activeNodeId,
        offset: offset + intent.text.length,
      };
    }

    case 'enter': {
      const { nodes, activeNodeId, offset } = state;
      const node = nodes.find((n) => n.id === activeNodeId);
      if (!node) return state;

      const textLength = node.text.length;

      // Case 1: Cursor in middle - split node
      if (offset > 0 && offset < textLength) {
        const [beforeNode, afterNode] = splitNode(node, offset);

        // Update current node with before text
        const updated = updateNodeText(nodes, node.id, beforeNode.text);

        // Insert new node with after text
        const withNew = insertNodeAfter(updated, node.id, afterNode);

        return {
          nodes: withNew,
          activeNodeId: afterNode.id,
          offset: 0,
        };
      }

      // Case 2 & 3: End of text or empty - create new empty node
      const newNode = createNode(node.type, '', node.parentId);
      const withNew = insertNodeAfter(nodes, node.id, newNode);

      return {
        nodes: withNew,
        activeNodeId: newNode.id,
        offset: 0,
      };
    }

    case 'backspace': {
      const { nodes, activeNodeId, offset } = state;
      const node = nodes.find((n) => n.id === activeNodeId);
      if (!node) return state;

      // CASE 1: Delete character (cursor inside text)
      if (offset > 0) {
        const newText =
          node.text.slice(0, offset - 1) + node.text.slice(offset);

        return {
          nodes: updateNodeText(nodes, node.id, newText),
          activeNodeId,
          offset: offset - 1,
        };
      }

      // CASE 2: Merge with previous (cursor at start with previous node)
      const prev = getPreviousNode(nodes, activeNodeId);
      if (!prev) return state; // CASE 3: No-op (at start with no previous)

      const merged = mergeNodes(prev, node);
      const mergePoint = prev.text.length;

      // Delete current node
      const withoutCurrent = deleteNode(nodes, node.id);

      // Update previous node with merged text
      const updated = updateNodeText(withoutCurrent, prev.id, merged.text);

      return {
        nodes: updated,
        activeNodeId: prev.id,
        offset: mergePoint,
      };
    }

    case 'moveUp': {
      const { nodes, activeNodeId, offset } = state;
      const prev = getPreviousNode(nodes, activeNodeId);
      if (!prev) return state;

      return {
        nodes,
        activeNodeId: prev.id,
        offset: Math.min(offset, prev.text.length),
      };
    }

    case 'moveDown': {
      const { nodes, activeNodeId, offset } = state;
      const next = getNextNode(nodes, activeNodeId);
      if (!next) return state;

      return {
        nodes,
        activeNodeId: next.id,
        offset: Math.min(offset, next.text.length),
      };
    }

    default:
      return state;
  }
}
