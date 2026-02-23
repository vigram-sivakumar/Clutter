/**
 * History — past/future of history entries. Undo = apply inverse ops in reverse. Redo = apply ops forward.
 * No shortcuts. Inverse logic explicit.
 */

import type { EditorState, PrimitiveOp } from './engine';
import { applyOp } from './engine';

export type HistoryEntry = {
  label: string;
  ops: PrimitiveOp[];
};

export type HistoryState = {
  past: HistoryEntry[];
  future: HistoryEntry[];
};

/**
 * Compute the inverse of a single op. Returns null for NormalizeInline (no inverse in schema).
 */
function inverseOp(op: PrimitiveOp): PrimitiveOp | null {
  switch (op.type) {
    case 'InsertNode':
      return { type: 'DeleteNode', id: op.id, parentId: op.parentId, index: op.index, node: op.node };

    case 'DeleteNode':
      return { type: 'InsertNode', id: op.id, parentId: op.parentId, index: op.index, node: op.node };

    case 'MoveNode':
      return {
        type: 'MoveNode',
        id: op.id,
        fromParentId: op.toParentId,
        fromIndex: op.toIndex,
        toParentId: op.fromParentId,
        toIndex: op.fromIndex,
      };

    case 'SetBlockType':
      return { type: 'SetBlockType', nodeId: op.nodeId, from: op.to, to: op.from };

    case 'ToggleCollapse':
      return { type: 'ToggleCollapse', nodeId: op.nodeId, from: op.to, to: op.from };

    case 'InsertText':
      return {
        type: 'DeleteText',
        nodeId: op.nodeId,
        inlineIndex: op.inlineIndex,
        offset: op.offset,
        length: op.text.length,
        deletedText: op.text,
      };

    case 'DeleteText':
      return {
        type: 'InsertText',
        nodeId: op.nodeId,
        inlineIndex: op.inlineIndex,
        offset: op.offset,
        text: op.deletedText,
      };

    case 'InsertInline':
      return { type: 'RemoveInline', nodeId: op.nodeId, inlineIndex: op.inlineIndex, removedInline: op.inline };

    case 'RemoveInline':
      return { type: 'InsertInline', nodeId: op.nodeId, inlineIndex: op.inlineIndex, inline: op.removedInline };

    case 'AddMark':
      return { type: 'RemoveMark', nodeId: op.nodeId, inlineIndex: op.inlineIndex, mark: op.mark };

    case 'RemoveMark':
      return { type: 'AddMark', nodeId: op.nodeId, inlineIndex: op.inlineIndex, mark: op.mark };

    case 'NormalizeInline':
      return null;
  }
}

function applyOps(state: EditorState, ops: PrimitiveOp[]): EditorState {
  let s = state;
  for (const op of ops) {
    s = applyOp(s, op);
  }
  return s;
}

/**
 * Push an entry onto past. Clears future.
 */
export function pushEntry(history: HistoryState, entry: HistoryEntry): HistoryState {
  return {
    past: [...history.past, entry],
    future: [],
  };
}

/**
 * Undo: apply inverse of past's last entry ops in reverse order. Move that entry to future.
 */
export function undo(state: EditorState, history: HistoryState): { state: EditorState; history: HistoryState } {
  if (history.past.length === 0) {
    return { state, history };
  }
  const entry = history.past[history.past.length - 1]!;
  const inverses: PrimitiveOp[] = [];
  for (let i = entry.ops.length - 1; i >= 0; i--) {
    const inv = inverseOp(entry.ops[i]!);
    if (inv) inverses.push(inv);
  }
  const newState = applyOps(state, inverses);
  const newHistory: HistoryState = {
    past: history.past.slice(0, -1),
    future: [entry, ...history.future],
  };
  return { state: newState, history: newHistory };
}

/**
 * Redo: apply future's first entry ops in forward order. Move that entry to past.
 */
export function redo(state: EditorState, history: HistoryState): { state: EditorState; history: HistoryState } {
  if (history.future.length === 0) {
    return { state, history };
  }
  const entry = history.future[0]!;
  const newState = applyOps(state, entry.ops);
  const newHistory: HistoryState = {
    past: [...history.past, entry],
    future: history.future.slice(1),
  };
  return { state: newState, history: newHistory };
}
