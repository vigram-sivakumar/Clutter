/**
 * Keyboard → commands. Enter, Backspace, Tab, Shift+Tab, Ctrl+Z, Ctrl+Shift+Z. Stub rest.
 */

import type { EditorState } from '../engine/engine';
import { getVisibleNodeIds } from '../engine/engine';
import type { EditorController } from './editor-controller';
import { isHandlingInput } from './input-lock';
import {
  indentCommand,
  mergeNodeCommand,
  outdentCommand,
} from '../engine/commands';

let _nextId = 0;

export function computeNextId(state: EditorState): number {
  let max = 0;
  for (const id in state.nodes) {
    const match = id.match(/^n(\d+)$/);
    const num = match ? parseInt(match[1]!, 10) : NaN;
    if (!Number.isNaN(num)) max = Math.max(max, num);
  }
  return max;
}

export function initIdGenerator(state: EditorState): void {
  _nextId = computeNextId(state);
}

export function genId(): string {
  return 'n' + ++_nextId;
}

export function setupKeymap(
  rootEl: HTMLElement,
  controller: EditorController
): () => void {
  const handler = (ev: KeyboardEvent) => {
    console.log('KEYDOWN', ev.key, controller.getState().selection);
    const state = controller.getState();

    if (!state.selection) {
      throw new Error('Selection should never be null');
    }

    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) controller.redo();
      else controller.undo();
      return;
    }

    if (ev.key === 'Tab') {
      ev.preventDefault();

      const sel = controller.getState().selection;
      if (!sel || sel.type !== 'collapsed') return;

      const ops = ev.shiftKey
        ? outdentCommand(state, sel.nodeId)
        : indentCommand(state, sel.nodeId);

      if (ops.length > 0) {
        controller.dispatch(ops, {
          type: 'collapsed',
          nodeId: sel.nodeId,
          inlineIndex: sel.inlineIndex,
          offset: sel.offset,
        });
      }

      return;
    }

    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'a') {
      ev.preventDefault();

      const sel = controller.getState().selection;

      if (sel?.type === 'collapsed') {
        selectAllInCurrentNode(controller);
      } else if (sel?.type === 'range') {
        const state = controller.getState();
        const node = state.nodes[sel.anchor.nodeId];
        const inline = node?.inlines[sel.anchor.inlineIndex];
        const isFullNode =
          node &&
          inline &&
          sel.anchor.offset === 0 &&
          sel.focus.offset ===
            (inline.type === 'text' ? inline.text.length : 0);
        if (isFullNode) {
          selectAllNodes(controller);
        } else {
          selectAllInCurrentNode(controller);
        }
      } else if (sel?.type === 'block-range') {
        selectAllNodes(controller);
      }

      return;
    }

    if (
      ev.key === 'ArrowLeft' ||
      ev.key === 'ArrowRight' ||
      ev.key === 'ArrowUp' ||
      ev.key === 'ArrowDown'
    ) {
      handleArrowNavigation(ev, controller, state);
      return;
    }

    if (ev.key === 'Delete') {
      ev.preventDefault();
      const sel = controller.getState().selection;
      if (sel?.type === 'block-range') {
        handleBackspace(controller);
      }
      // collapsed/range forward-delete: stub, not yet implemented
      return;
    }

    if (ev.key === 'Backspace') {
      ev.preventDefault();

      const sel = controller.getState().selection;
      if (!sel) return;

      const state = controller.getState();

      // Block-range deletion
      if (sel.type === 'block-range') {
        handleBackspace(controller);
        return;
      }

      // Range inline deletion (same-node only)
      if (sel.type === 'range') {
        if (sel.anchor.nodeId !== sel.focus.nodeId) return;

        const nodeId = sel.anchor.nodeId;
        const inlineIndex = sel.anchor.inlineIndex;

        const startOffset = Math.min(sel.anchor.offset, sel.focus.offset);
        const endOffset = Math.max(sel.anchor.offset, sel.focus.offset);
        const length = endOffset - startOffset;
        if (length <= 0) return;

        const node = state.nodes[nodeId];
        const seg = node?.inlines[inlineIndex];
        if (!seg || seg.type !== 'text') return;

        const deletedText = seg.text.slice(startOffset, endOffset);

        controller.dispatch(
          [
            {
              type: 'DeleteText',
              nodeId,
              inlineIndex,
              offset: startOffset,
              length,
              deletedText,
            },
            { type: 'NormalizeInline', nodeId },
          ],
          {
            type: 'collapsed',
            nodeId,
            inlineIndex,
            offset: startOffset,
          }
        );

        return;
      }

      // Collapsed caret
      if (sel.type === 'collapsed') {
        const node = state.nodes[sel.nodeId];
        if (!node) return;

        const seg = node.inlines[sel.inlineIndex];
        if (!seg || seg.type !== 'text') return;

        // Inline delete
        if (sel.offset > 0) {
          const deleteOffset = sel.offset - 1;
          const deletedChar = seg.text.slice(deleteOffset, deleteOffset + 1);

          controller.dispatch(
            [
              {
                type: 'DeleteText',
                nodeId: sel.nodeId,
                inlineIndex: sel.inlineIndex,
                offset: deleteOffset,
                length: 1,
                deletedText: deletedChar,
              },
              { type: 'NormalizeInline', nodeId: sel.nodeId },
            ],
            {
              type: 'collapsed',
              nodeId: sel.nodeId,
              inlineIndex: sel.inlineIndex,
              offset: deleteOffset,
            }
          );

          return;
        }

        // Structural merge
        handleBackspace(controller);
      }
    }
  };

  rootEl.addEventListener('keydown', handler);

  return () => {
    rootEl.removeEventListener('keydown', handler);
  };
}

/**
 * Recursively generate leaf-first DeleteNode ops for a node and its entire subtree.
 * Children are processed at DESCENDING indices so removing from the end keeps lower
 * indices stable for subsequent ops at the same level.
 * Each node is stored with children:[] so InsertNode on undo doesn't reference
 * children that haven't been re-inserted yet at that undo step.
 */
function generateSubtreeDeleteOps(
  state: EditorState,
  id: string,
  parentId: string,
  simulatedIndex: number,
  ops: import('../engine/engine').PrimitiveOp[]
): void {
  const node = state.nodes[id];
  if (!node) return;

  for (let i = node.children.length - 1; i >= 0; i--) {
    generateSubtreeDeleteOps(state, node.children[i]!, id, i, ops);
  }

  ops.push({
    type: 'DeleteNode',
    id,
    parentId,
    index: simulatedIndex,
    node: { ...node, children: [] },
  });
}

function isSystemicNode(state: EditorState, id: string): boolean {
  const root = state.nodes[state.rootId];
  if (!root) return false;
  const last = root.children[root.children.length - 1];
  const node = state.nodes[id];
  if (!node) return false;

  const isEmpty =
    node.inlines.length === 1 &&
    node.inlines[0]!.type === 'text' &&
    node.inlines[0]!.text.trim() === '';

  return id === last && isEmpty && node.children.length === 0;
}

function handleBackspace(controller: EditorController) {
  const sel = controller.getState().selection;
  if (!sel) return;

  const state = controller.getState();

  if (sel.type === 'block-range') {
    console.log('DELETE PRESSED', state.selection);

    const root = state.nodes[state.rootId];
    if (!root) return;

    const visible = getVisibleNodeIds(state);
    const startIndex = visible.indexOf(sel.startNodeId);
    const endIndex = visible.indexOf(sel.endNodeId);

    if (startIndex === -1 || endIndex === -1) return;

    const firstIndex = Math.min(startIndex, endIndex);
    const lastIndex = Math.max(startIndex, endIndex);

    const idsToDelete = visible.slice(firstIndex, lastIndex + 1);

    const idsToDeleteSet = new Set(idsToDelete);
    const topLevelIds = idsToDelete.filter((id) => {
      const node = state.nodes[id];
      if (!node || !node.parentId) return false;
      return !idsToDeleteSet.has(node.parentId);
    });

    const ops: import('../engine/engine').PrimitiveOp[] = [];

    // Track simulated post-deletion child arrays so each DeleteNode op records
    // the index of the node *after* prior siblings have been removed.
    // Without this, all ops record original indices and undo (reverse-order
    // InsertNode) inserts each node at a stale position, reconstructing the
    // wrong order.
    const simulatedChildren = new Map<string, string[]>();
    const getSimulated = (parentId: string) => {
      if (!simulatedChildren.has(parentId)) {
        const p = state.nodes[parentId];
        simulatedChildren.set(parentId, p ? [...p.children] : []);
      }
      return simulatedChildren.get(parentId)!;
    };

    for (const id of topLevelIds) {
      const node = state.nodes[id];
      if (!node) continue;
      if (isSystemicNode(state, id)) continue;
      const parent = state.nodes[node.parentId!];
      if (!parent) continue;
      const sim = getSimulated(node.parentId!);
      const index = sim.indexOf(id);
      if (index < 0) continue;
      generateSubtreeDeleteOps(state, id, node.parentId!, index, ops);
      simulatedChildren.set(
        node.parentId!,
        sim.filter((c) => c !== id)
      );
    }

    controller.dispatch(ops);

    return;
  }

  // Range deletion handled via beforeinput (inline only)
  if (sel.type === 'range') return;

  // Inline deletion (offset > 0 handled by beforeinput)
  if (sel.offset > 0) return;

  // Structural case: offset === 0
  const node = state.nodes[sel.nodeId];
  if (!node) return;

  const parent = node.parentId ? state.nodes[node.parentId] : undefined;
  if (!parent) return;

  const myIndex = parent.children.indexOf(sel.nodeId);
  if (myIndex < 0) return;
  if (node.parentId === state.rootId && myIndex === 0) return;

  const prevId = myIndex > 0 ? parent.children[myIndex - 1] : null;

  // Merge into previous sibling
  if (prevId) {
    const ops = mergeNodeCommand(state, sel.nodeId);
    if (ops.length === 0) return;

    const prevNode = state.nodes[prevId];
    if (!prevNode) return;

    const lastInlineIndex = prevNode.inlines.length - 1;
    const lastInline = prevNode.inlines[lastInlineIndex];
    const offset =
      lastInline && lastInline.type === 'text' ? lastInline.text.length : 0;

    controller.dispatch(ops, {
      type: 'collapsed',
      nodeId: prevId,
      inlineIndex: lastInlineIndex,
      offset,
    });

    return;
  }

  // No previous sibling → do nothing
}

function selectAllInCurrentNode(controller: EditorController) {
  const sel = controller.getState().selection;
  if (!sel) return;
  const nodeId =
    sel.type === 'collapsed'
      ? sel.nodeId
      : sel.type === 'range'
        ? sel.anchor.nodeId
        : null;
  if (!nodeId) return;
  const state = controller.getState();
  const node = state.nodes[nodeId];
  const inline = node?.inlines[0];
  if (!node || !inline) return;
  const endOffset = inline.type === 'text' ? inline.text.length : 0;
  if (!isHandlingInput) {
    controller.dispatch([], {
      type: 'range',
      anchor: { nodeId, inlineIndex: 0, offset: 0 },
      focus: { nodeId, inlineIndex: 0, offset: endOffset },
    });
  }
}

function selectAllNodes(controller: EditorController) {
  const state = controller.getState();
  const root = state.nodes[state.rootId];
  if (!root) return;
  const ids = root.children;
  const firstId = ids[0];
  const lastId = ids[ids.length - 1];
  if (firstId && lastId && !isHandlingInput) {
    controller.dispatch([], {
      type: 'block-range',
      startNodeId: firstId,
      endNodeId: lastId,
    });
  }
}

function handleArrowNavigation(
  ev: KeyboardEvent,
  controller: EditorController,
  state: EditorState
) {
  const sel = controller.getState().selection;

  // Block-range: collapse to edge based on direction.
  // Left/Up → first visible node in range; Right/Down → last visible node.
  if (sel?.type === 'block-range') {
    ev.preventDefault();
    const visible = getVisibleNodeIds(state);
    const startIdx = visible.indexOf(sel.startNodeId);
    const endIdx = visible.indexOf(sel.endNodeId);
    if (startIdx === -1 || endIdx === -1) return;
    const collapseToEnd = ev.key === 'ArrowRight' || ev.key === 'ArrowDown';
    const targetId =
      visible[
        collapseToEnd ? Math.max(startIdx, endIdx) : Math.min(startIdx, endIdx)
      ];
    if (!targetId || isHandlingInput) return;
    controller.dispatch([], {
      type: 'collapsed',
      nodeId: targetId,
      inlineIndex: 0,
      offset: 0,
    });
    return;
  }

  if (!sel || sel.type !== 'collapsed') return;

  // State owns cursor — always prevent default for all arrow keys so the
  // browser never moves the caret independently of our state.
  ev.preventDefault();

  const node = state.nodes[sel.nodeId];
  if (!node) return;

  const inline = node.inlines[sel.inlineIndex];
  const textLength = inline && inline.type === 'text' ? inline.text.length : 0;

  // LEFT
  if (ev.key === 'ArrowLeft') {
    // Move inside text
    if (sel.offset > 0 && !isHandlingInput) {
      controller.dispatch([], {
        type: 'collapsed',
        nodeId: sel.nodeId,
        inlineIndex: sel.inlineIndex,
        offset: sel.offset - 1,
      });
      return;
    }

    // Move to previous inline segment
    if (sel.inlineIndex > 0 && !isHandlingInput) {
      const prevInlineIndex = sel.inlineIndex - 1;

      const prevInline = node.inlines[prevInlineIndex];
      const prevLength =
        prevInline && prevInline.type === 'text' ? prevInline.text.length : 0;

      controller.dispatch([], {
        type: 'collapsed',
        nodeId: sel.nodeId,
        inlineIndex: prevInlineIndex,
        offset: prevLength,
      });
      return;
    }

    // Move to previous visible node
    const prev = getPreviousVisibleNode(state, sel.nodeId);
    if (!prev) return;

    moveCaretToNodeEnd(prev, controller);
    return;
  }

  // RIGHT
  if (ev.key === 'ArrowRight') {
    // Move inside text
    if (sel.offset < textLength && !isHandlingInput) {
      controller.dispatch([], {
        type: 'collapsed',
        nodeId: sel.nodeId,
        inlineIndex: sel.inlineIndex,
        offset: sel.offset + 1,
      });
      return;
    }

    // Move to next inline segment
    if (sel.inlineIndex < node.inlines.length - 1 && !isHandlingInput) {
      const nextInlineIndex = sel.inlineIndex + 1;

      controller.dispatch([], {
        type: 'collapsed',
        nodeId: sel.nodeId,
        inlineIndex: nextInlineIndex,
        offset: 0,
      });
      return;
    }

    // Move to next visible node
    const next = getNextVisibleNode(state, sel.nodeId);
    if (!next) return;

    moveCaretToNodeStart(next, controller);
    return;
  }

  // UP
  if (ev.key === 'ArrowUp') {
    const prev = getPreviousVisibleNode(state, sel.nodeId);
    if (!prev) return;
    moveCaretToNodeStart(prev, controller);
    return;
  }

  // DOWN
  if (ev.key === 'ArrowDown') {
    const next = getNextVisibleNode(state, sel.nodeId);
    if (!next) return;
    moveCaretToNodeStart(next, controller);
  }
}

function getPreviousVisibleNode(
  state: EditorState,
  nodeId: string
): string | null {
  const ids = getVisibleNodeIds(state);
  const index = ids.indexOf(nodeId);
  if (index <= 0) return null;
  return ids[index - 1] ?? null;
}

function getNextVisibleNode(state: EditorState, nodeId: string): string | null {
  const ids = getVisibleNodeIds(state);
  const index = ids.indexOf(nodeId);
  if (index < 0 || index >= ids.length - 1) return null;
  return ids[index + 1] ?? null;
}

function moveCaretToNodeStart(nodeId: string, controller: EditorController) {
  if (!isHandlingInput) {
    controller.dispatch([], {
      type: 'collapsed',
      nodeId,
      inlineIndex: 0,
      offset: 0,
    });
  }
}

function moveCaretToNodeEnd(nodeId: string, controller: EditorController) {
  const state = controller.getState();
  const node = state.nodes[nodeId];
  if (!node) return;

  const lastInlineIndex = node.inlines.length - 1;
  const lastInline = node.inlines[lastInlineIndex];

  let offset = 0;
  if (lastInline && lastInline.type === 'text') {
    offset = lastInline.text.length;
  }

  if (!isHandlingInput) {
    controller.dispatch([], {
      type: 'collapsed',
      nodeId,
      inlineIndex: lastInlineIndex,
      offset,
    });
  }
}
