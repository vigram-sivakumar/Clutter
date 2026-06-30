/**
 * Commands — produce PrimitiveOp[] from state. Never mutate state. Never call applyOp.
 * IDs (e.g. newId) are supplied by caller; no random ID generation during replay.
 */

import type { EditorState, Node, Inline, PrimitiveOp, Mark } from './engine';

function getNode(state: EditorState, nodeId: string): Node | undefined {
  return state.nodes[nodeId];
}

function getChildIndex(parent: Node, nodeId: string): number {
  return parent.children.indexOf(nodeId);
}

/**
 * Insert text at (inlineIndex, offset). Caller supplies state; returns ops only.
 */
export function insertTextCommand(
  state: EditorState,
  nodeId: string,
  inlineIndex: number,
  offset: number,
  text: string
): PrimitiveOp[] {
  const node = getNode(state, nodeId);
  if (!node) return [];
  const seg = node.inlines[inlineIndex];
  if (!seg || seg.type !== 'text') return [];
  const ops: PrimitiveOp[] = [
    { type: 'InsertText', nodeId, inlineIndex, offset, text },
    { type: 'NormalizeInline', nodeId },
  ];
  return ops;
}

/**
 * Split node at (inlineIndex, offset). New node gets tail; current gets head.
 * Caller supplies newId for the new node. Inserted after current in parent's children.
 */
export function splitNodeCommand(
  state: EditorState,
  nodeId: string,
  inlineIndex: number,
  offset: number,
  newId: string
): PrimitiveOp[] {
  const node = getNode(state, nodeId);
  const parent = node?.parentId ? getNode(state, node.parentId) : undefined;
  if (!node || !parent) return [];
  const myIndex = getChildIndex(parent, nodeId);
  if (myIndex < 0) return [];

  const inlines = node.inlines;
  const seg = inlines[inlineIndex];
  if (!seg || seg.type !== 'text') return [];

  const tailText = seg.text.slice(offset);
  const tailInlines: Inline[] =
    tailText.length > 0
      ? [{ type: 'text', text: tailText, marks: [...seg.marks] }, ...inlines.slice(inlineIndex + 1)]
      : inlines.slice(inlineIndex + 1);
  if (tailInlines.length === 0) tailInlines.push({ type: 'text', text: '', marks: [] });

  const parentId = node.parentId!;
  const newNode: Node = {
    id: newId,
    parentId,
    blockType: node.blockType,
    inlines: tailInlines,
    children: [],
    collapsed: false,
  };

  const ops: PrimitiveOp[] = [
    { type: 'InsertNode', id: newId, parentId: parentId, index: myIndex + 1, node: newNode },
    {
      type: 'DeleteText',
      nodeId,
      inlineIndex,
      offset,
      length: tailText.length,
      deletedText: tailText,
    },
  ];
  for (let i = inlines.length - 1; i > inlineIndex; i--) {
    const removed = inlines[i]!;
    ops.push({
      type: 'RemoveInline',
      nodeId,
      inlineIndex: i,
      removedInline: removed,
    });
  }
  ops.push({ type: 'NormalizeInline', nodeId });
  return ops;
}

function marksEqual(a: Mark[], b: Mark[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ma = a[i]!;
    const mb = b[i]!;
    if (ma.type !== mb.type) return false;
    if ('value' in ma && 'value' in mb && ma.value !== mb.value) return false;
  }
  return true;
}

/**
 * Merge current node into previous sibling. Current node is deleted; its inlines appended to prev.
 */
export function mergeNodeCommand(state: EditorState, nodeId: string): PrimitiveOp[] {
  const node = getNode(state, nodeId);
  const parent = node?.parentId ? getNode(state, node.parentId) : undefined;
  if (!node || !parent) return [];
  const myIndex = getChildIndex(parent, nodeId);
  if (myIndex <= 0) return [];
  const prevId = parent.children[myIndex - 1]!;
  const prev = getNode(state, prevId);
  if (!prev) return [];

  const ops: PrimitiveOp[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const childId = node.children[i]!;
    ops.push({
      type: 'MoveNode',
      id: childId,
      fromParentId: nodeId,
      fromIndex: 0,
      toParentId: prevId,
      toIndex: prev.children.length + i,
    });
  }

  const prevLastInlineIndex = prev.inlines.length - 1;
  const prevLastInline = prev.inlines[prevLastInlineIndex];
  const firstNodeInline = node.inlines[0];

  let nodeInlineStart = 0;

  if (
    prevLastInline &&
    prevLastInline.type === 'text' &&
    firstNodeInline &&
    firstNodeInline.type === 'text' &&
    marksEqual(prevLastInline.marks, firstNodeInline.marks)
  ) {
    nodeInlineStart = 1;
    if (firstNodeInline.text.length > 0) {
      ops.push({
        type: 'InsertText',
        nodeId: prevId,
        inlineIndex: prevLastInlineIndex,
        offset: prevLastInline.text.length,
        text: firstNodeInline.text,
      });
    }
  }

  let insertIndex = prev.inlines.length;
  for (let i = nodeInlineStart; i < node.inlines.length; i++) {
    ops.push({ type: 'InsertInline', nodeId: prevId, inlineIndex: insertIndex, inline: node.inlines[i]! });
    insertIndex += 1;
  }

  const parentId = parent.id;
  ops.push({
    type: 'DeleteNode',
    id: nodeId,
    parentId,
    index: myIndex,
    // Store with empty children — children have already been moved out via MoveNode ops.
    // If we stored node.children here, InsertNode on undo would pre-populate the children
    // array, and the MoveNode inverses would then duplicate them.
    node: { ...node, children: [] },
  });
  return ops;
}

/**
 * Indent: move node to become last child of previous sibling.
 */
export function indentCommand(state: EditorState, nodeId: string): PrimitiveOp[] {
  const node = getNode(state, nodeId);
  const parent = node?.parentId ? getNode(state, node.parentId) : undefined;
  if (!node || !parent) return [];
  const myIndex = getChildIndex(parent, nodeId);
  if (myIndex <= 0) return [];
  const prevId = parent.children[myIndex - 1]!;
  const prev = getNode(state, prevId);
  if (!prev) return [];

  const toIndex = prev.children.length;
  return [
    {
      type: 'MoveNode',
      id: nodeId,
      fromParentId: parent.id,
      fromIndex: myIndex,
      toParentId: prevId,
      toIndex,
    },
  ];
}

/**
 * Outdent: move node to become next sibling of parent (after parent in parent's parent).
 */
export function outdentCommand(state: EditorState, nodeId: string): PrimitiveOp[] {
  const node = getNode(state, nodeId);
  const parent = node?.parentId ? getNode(state, node.parentId) : undefined;
  if (!parent) return [];
  const grandparent = parent.parentId ? getNode(state, parent.parentId) : undefined;
  const parentIndex = grandparent ? getChildIndex(grandparent, parent.id) : -1;
  if (parentIndex < 0) return [];

  const myIndex = getChildIndex(parent, nodeId);
  if (myIndex < 0) return [];

  const fromParentId = parent.id;
  const toParentId: string = grandparent ? grandparent.id : parent.id;
  const toIndex = grandparent ? parentIndex + 1 : 0;
  return [
    {
      type: 'MoveNode',
      id: nodeId,
      fromParentId,
      fromIndex: myIndex,
      toParentId,
      toIndex,
    },
  ];
}

function hasMark(marks: Mark[], mark: Mark): boolean {
  return marks.some(
    (m) =>
      m.type === mark.type &&
      (!('value' in m) || !('value' in mark) || m.value === (mark as { value: string }).value)
  );
}

/**
 * Toggle mark at (inlineIndex). If mark present, RemoveMark; else AddMark.
 */
export function toggleMarkCommand(
  state: EditorState,
  nodeId: string,
  inlineIndex: number,
  mark: Mark
): PrimitiveOp[] {
  const node = getNode(state, nodeId);
  if (!node) return [];
  const seg = node.inlines[inlineIndex];
  if (!seg || seg.type !== 'text') return [];
  const present = hasMark(seg.marks, mark);
  const ops: PrimitiveOp[] = present
    ? [{ type: 'RemoveMark', nodeId, inlineIndex, mark }]
    : [{ type: 'AddMark', nodeId, inlineIndex, mark }];
  ops.push({ type: 'NormalizeInline', nodeId });
  return ops;
}
