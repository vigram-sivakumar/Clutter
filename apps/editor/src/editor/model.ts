/**
 * Editor V2 — Pure data model only.
 * Plain-text, Workflowy-grade. No segments, no snapshot, no DOM.
 */

export type NodeID = string;

export type Node = {
  id: NodeID;
  text: string;
  parentId: NodeID | null;
};

export type EditorState = {
  nodes: Node[];
  cursor: {
    nodeId: NodeID;
    offset: number;
  };
  /** Collapse is visibility only. Never mutates nodes. */
  collapsed: Set<NodeID>;
};

export function generateId(): NodeID {
  return crypto.randomUUID();
}
