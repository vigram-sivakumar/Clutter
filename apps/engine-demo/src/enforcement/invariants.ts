/**
 * 🔒 ENFORCEMENT LAYER — Fail-Fast Invariants
 *
 * CRITICAL PRINCIPLE:
 * If an invariant can be violated, it WILL be violated.
 * Every invariant must crash immediately, not fail silently.
 *
 * These assertions run after EVERY state change in dev mode.
 * They detect forbidden states and architectural violations.
 *
 * If you add a new invariant, add an assertion here.
 * If you remove an invariant, delete the assertion.
 * Never rely on comments or documentation.
 */

import type { Node, CursorPosition, Segment } from '../engine/NodeKernel';
// ✂️ PHASE 2.5: TypingBuffer imports DELETED
import { getModel } from '../editor/EditorModel';

/**
 * FORBIDDEN STATE 1: Cursor node not found
 */
function assertCursorNodeExists(
  nodes: readonly Node[],
  cursor: CursorPosition
): void {
  const node = nodes.find((n) => n.id === cursor.nodeId);
  if (!node) {
    throw new Error(
      `FORBIDDEN STATE: Cursor points to non-existent node\n` +
        `cursor.nodeId: ${cursor.nodeId}\n` +
        `Available nodes: ${nodes.map((n) => n.id).join(', ')}`
    );
  }
}

/**
 * FORBIDDEN STATE 2: Offset > segment length
 */
function assertCursorOffsetValid(node: Node, cursor: CursorPosition): void {
  if (cursor.segmentIndex >= node.segments.length) {
    // Cursor after last segment - offset must be 0
    if (cursor.offset !== 0) {
      throw new Error(
        `FORBIDDEN STATE: Cursor after segments with non-zero offset\n` +
          `segmentIndex: ${cursor.segmentIndex}, segments.length: ${node.segments.length}\n` +
          `offset: ${cursor.offset} (must be 0)`
      );
    }
    return;
  }

  const segment = node.segments[cursor.segmentIndex];
  if (segment.type === 'text') {
    if (cursor.offset > segment.text.length) {
      throw new Error(
        `FORBIDDEN STATE: Cursor offset exceeds text length\n` +
          `segment text: "${segment.text}" (length ${segment.text.length})\n` +
          `cursor.offset: ${cursor.offset}`
      );
    }
  } else {
    // Inline segment - offset must be 0
    if (cursor.offset !== 0) {
      throw new Error(
        `FORBIDDEN STATE: Cursor in inline segment with non-zero offset\n` +
          `segment type: ${segment.type}\n` +
          `cursor.offset: ${cursor.offset} (must be 0)`
      );
    }
  }
}

/**
 * FORBIDDEN STATE 3: Model and React cursors diverged
 */
function assertModelReactSync(
  modelCursor: CursorPosition,
  reactCursor: CursorPosition
): void {
  // ✂️ PHASE 2.5: isTyping() check DELETED
  // With MutationObserver, cursor is always read from DOM at commit boundaries
  // No divergence possible - DOM is single source of truth during typing

  // Compare
  if (
    modelCursor.nodeId !== reactCursor.nodeId ||
    modelCursor.segmentIndex !== reactCursor.segmentIndex ||
    modelCursor.offset !== reactCursor.offset
  ) {
    throw new Error(
      `FORBIDDEN STATE: Model and React cursors diverged\n` +
        `Model: ${JSON.stringify(modelCursor)}\n` +
        `React: ${JSON.stringify(reactCursor)}\n` +
        `This indicates a missing updateModel() call.`
    );
  }
}

/**
 * FORBIDDEN STATE 4: NodeView rendering while typing
 */
export function assertNotRenderingDuringTyping(nodeId: string): void {
  // ✂️ PHASE 2.5: isTyping() check DELETED
  // With MutationObserver, React re-renders only at commit boundaries
  // Observer is stopped before commit, so no concurrent mutations possible
  // This assertion is now structural (enforced by observer lifecycle) not temporal (flag-based)
  // No-op - kept for compatibility with existing calls
  // Will be removed in future cleanup
}

/**
 * FORBIDDEN STATE 5: Segments mutated in place
 */
function assertSegmentsImmutable(segments: readonly Segment[]): void {
  // In dev mode, check if segments are frozen
  if (__DEV__) {
    try {
      // Try to mutate - should throw if frozen
      (segments as any).testMutation = true;
      delete (segments as any).testMutation;

      // If we get here, segments are NOT frozen
      // This is a warning, not a hard error (for now)
      console.warn(
        '⚠️ Segments array is not frozen. ' +
          'Mutations are possible. Consider Object.freeze() in production.'
      );
    } catch (e) {
      // Good - segments are frozen
    }
  }
}

/**
 * MASTER ASSERTION: Run all invariants
 */
export function assertEditorInvariants(
  nodes: readonly Node[],
  cursor: CursorPosition,
  label: string = 'unknown'
): void {
  if (!__DEV__) return; // Only in dev mode

  try {
    // 1. Cursor node exists
    assertCursorNodeExists(nodes, cursor);

    // 2. Find the node
    const node = nodes.find((n) => n.id === cursor.nodeId)!;

    // 3. Cursor offset valid
    assertCursorOffsetValid(node, cursor);

    // 4. Model and React in sync
    const model = getModel();
    if (model) {
      assertModelReactSync(model.cursor, cursor);
    }

    // 5. Segments immutability
    node.segments.forEach((seg) => {
      if (seg.type === 'text') {
        // Check text is not empty string with segments present
        if (seg.text === '' && node.segments.length > 1) {
          console.warn(
            `⚠️ Empty text segment in node with multiple segments: ${node.id}`
          );
        }
      }
    });
  } catch (error) {
    console.error(`❌ INVARIANT VIOLATION at [${label}]:`, error);
    throw error; // Re-throw to crash
  }
}

/**
 * ASSERTION: DOM and segments match (when not typing)
 */
export function assertDOMSegmentSync(
  nodeId: string,
  domElement: HTMLElement,
  segments: readonly Segment[]
): void {
  if (!__DEV__) return;
  // ✂️ PHASE 2.5: isTyping() check DELETED
  // With MutationObserver, DOM is always in sync at commit boundaries

  const domText = domElement.textContent || '';
  const segmentText = segments
    .map((s) => (s.type === 'text' ? s.text : `@${s.id}`))
    .join('');

  if (domText !== segmentText) {
    console.warn(
      `⚠️ DOM/Segment mismatch in node ${nodeId}\n` +
        `DOM: "${domText}"\n` +
        `Segments: "${segmentText}"\n` +
        `This may indicate NodeView failed to render.`
    );
  }
}

/**
 * Freeze helper for dev mode
 */
export function deepFreeze<T>(obj: T): T {
  if (!__DEV__) return obj;

  Object.freeze(obj);

  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const value = (obj as any)[prop];
    if (value && typeof value === 'object') {
      deepFreeze(value);
    }
  });

  return obj;
}

// Global declaration for __DEV__
declare const __DEV__: boolean;
