/**
 * Editor V2 — Small helpers for reducer and components.
 */

import type { Node, NodeID } from './model';

export function getDepth(nodes: Node[], nodeId: NodeID): number {
  let depth = 0;
  let current = nodes.find((n) => n.id === nodeId);
  while (current?.parentId) {
    depth++;
    current = nodes.find((n) => n.id === current?.parentId);
  }
  return depth;
}

export function getSubtreeRange(
  nodes: Node[],
  startIndex: number
): { start: number; end: number } {
  const root = nodes[startIndex];
  if (!root) return { start: startIndex, end: startIndex };

  const rootId = root.id;
  let end = startIndex;

  for (let i = startIndex + 1; i < nodes.length; i++) {
    const candidate = nodes[i];
    if (!candidate) break;

    let current: Node | undefined = candidate;
    let isDescendant = false;

    while (current?.parentId) {
      if (current.parentId === rootId) {
        isDescendant = true;
        break;
      }
      current = nodes.find((n) => n.id === current!.parentId);
    }

    if (!isDescendant) break;

    end = i;
  }

  return { start: startIndex, end };
}

export function findNodeIndex(nodes: Node[], nodeId: NodeID): number {
  return nodes.findIndex((n) => n.id === nodeId);
}

export function getPreviousNode(nodes: Node[], index: number): Node | null {
  if (index <= 0) return null;
  return nodes[index - 1] ?? null;
}

export function getNextNode(nodes: Node[], index: number): Node | null {
  if (index < 0 || index >= nodes.length - 1) return null;
  return nodes[index + 1] ?? null;
}

export function getPlainText(node: Node): string {
  return node.text;
}

/** O(depth): walk parent chain; hidden iff any ancestor is in collapsed set. */
export function isNodeHidden(
  nodes: Node[],
  nodeId: NodeID,
  collapsed: Set<NodeID>
): boolean {
  let current = nodes.find((n) => n.id === nodeId);

  while (current?.parentId) {
    const parent = nodes.find((n) => n.id === current?.parentId);
    if (!parent) break;

    if (collapsed.has(parent.id)) return true;

    current = parent;
  }

  return false;
}
