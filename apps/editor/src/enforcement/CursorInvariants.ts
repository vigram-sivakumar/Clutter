/**
 * 🔒 CURSOR INVARIANTS — Crash on Invalid Cursor States
 *
 * These assertions run AFTER EVERY RENDER to ensure:
 * - Cursor node exists
 * - Segment index valid
 * - Offset valid
 * - Model === React (when not typing)
 */

import type { Node, CursorPosition } from '../engine/NodeKernel';
// NOTE: EditorModel singleton removed - invariants now take explicit state
// import { getModel } from '../editor/EditorModel';
// ✂️ PHASE 2.5: TypingBuffer import DELETED

/**
 * Assert cursor node exists in nodes array
 */
export function assertCursorNodeExists(
  nodes: readonly Node[],
  cursor: CursorPosition
): void {
  const node = nodes.find((n) => n.id === cursor.nodeId);

  if (!node) {
    const nodeIds = nodes.map((n) => n.id).join(', ');
    throw new Error(
      `❌ FORBIDDEN STATE: Cursor node not found\n` +
        `Cursor nodeId: ${cursor.nodeId}\n` +
        `Available nodes: ${nodeIds}`
    );
  }
}

/**
 * Assert segment index is valid
 */
export function assertSegmentIndexValid(
  node: Node,
  cursor: CursorPosition
): void {
  const maxIndex = node.segments.length;

  if (cursor.segmentIndex < 0 || cursor.segmentIndex > maxIndex) {
    throw new Error(
      `❌ FORBIDDEN STATE: Invalid segment index\n` +
        `Segment index: ${cursor.segmentIndex}\n` +
        `Valid range: 0-${maxIndex}\n` +
        `Node: ${node.id}`
    );
  }
}

/**
 * Assert offset is valid for segment
 */
export function assertOffsetValid(node: Node, cursor: CursorPosition): void {
  // If cursor after all segments, offset must be 0
  if (cursor.segmentIndex >= node.segments.length) {
    if (cursor.offset !== 0) {
      throw new Error(
        `❌ FORBIDDEN STATE: Cursor after segments with non-zero offset\n` +
          `Segment index: ${cursor.segmentIndex}\n` +
          `Offset: ${cursor.offset}\n` +
          `Expected: 0\n` +
          `Node: ${node.id}`
      );
    }
    return;
  }

  const segment = node.segments[cursor.segmentIndex];

  if (segment.type === 'text') {
    const maxOffset = segment.text.length;

    if (cursor.offset < 0 || cursor.offset > maxOffset) {
      throw new Error(
        `❌ FORBIDDEN STATE: Cursor offset exceeds text length\n` +
          `Offset: ${cursor.offset}\n` +
          `Text length: ${maxOffset}\n` +
          `Segment index: ${cursor.segmentIndex}\n` +
          `Node: ${node.id}`
      );
    }
  } else {
    // Inline segment: offset must be 0 or 1 (before/after)
    if (cursor.offset !== 0 && cursor.offset !== 1) {
      throw new Error(
        `❌ FORBIDDEN STATE: Invalid offset for inline segment\n` +
          `Offset: ${cursor.offset}\n` +
          `Expected: 0 or 1\n` +
          `Segment index: ${cursor.segmentIndex}\n` +
          `Node: ${node.id}`
      );
    }
  }
}

/**
 * Assert model cursor === React cursor (when not typing)
 */
export function assertModelReactSync(
  reactNodes: readonly Node[],
  reactCursor: CursorPosition
): void {
  // ✂️ PHASE 2.5: isTyping() check DELETED
  // With MutationObserver, no divergence possible during typing
  // DOM is extracted at commit boundaries only

  // NOTE: Singleton model removed - no model check needed
  const model = null;

  if (!model) {
    throw new Error('Model not initialized');
  }

  // Check cursor sync
  if (
    model.cursor.nodeId !== reactCursor.nodeId ||
    model.cursor.segmentIndex !== reactCursor.segmentIndex ||
    model.cursor.offset !== reactCursor.offset
  ) {
    throw new Error(
      `❌ FORBIDDEN STATE: Model/React cursor divergence\n` +
        `Model cursor: ${JSON.stringify(model.cursor)}\n` +
        `React cursor: ${JSON.stringify(reactCursor)}\n` +
        `This indicates a mutation that bypassed setStateAndModel()`
    );
  }

  // Check node count (rough check)
  if ((model.nodes as Node[]).length !== reactNodes.length) {
    throw new Error(
      `❌ FORBIDDEN STATE: Model/React node count mismatch\n` +
        `Model nodes: ${(model.nodes as Node[]).length}\n` +
        `React nodes: ${reactNodes.length}\n` +
        `This indicates a mutation that bypassed setStateAndModel()`
    );
  }
}

/**
 * Master cursor assertion (runs after every render)
 */
export function assertCursorInvariants(
  nodes: readonly Node[],
  cursor: CursorPosition,
  label: string = 'unknown'
): void {
  try {
    assertCursorNodeExists(nodes, cursor);

    const node = nodes.find((n) => n.id === cursor.nodeId)!;
    assertSegmentIndexValid(node, cursor);
    assertOffsetValid(node, cursor);

    assertModelReactSync(nodes, cursor);
  } catch (error) {

    throw error;
  }
}
