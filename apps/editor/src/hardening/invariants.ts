/**
 * 🔒 ZERO-RISK HARDENING — Runtime Invariants
 * 
 * These assertions enforce architectural guarantees at runtime.
 * They MUST be called after every mutation and before every commit.
 * 
 * FAILURE MODE: Crash early, never corrupt.
 */

import type { Node, Segment, NodeID } from './editor/engine';
import type { CursorPosition } from './editor/engine';

/**
 * Assert node structure is valid
 * 
 * Enforces:
 * - segments array exists and is valid
 * - No empty text segments
 * - All inline segments have required fields
 */
export function assertValidNode(node: Node): asserts node is Node {
  // Segments must be an array
  if (!Array.isArray(node.segments)) {
    throw new Error(`[INVARIANT] node.segments must be an array (node: ${node.id})`);
  }

  // Empty segments array is valid (empty node)
  if (node.segments.length === 0) {
    return;
  }

  // Validate each segment
  for (let i = 0; i < node.segments.length; i++) {
    const seg = node.segments[i];
    
    if (!seg || typeof seg.type !== 'string') {
      throw new Error(`[INVARIANT] Invalid segment at index ${i} in node ${node.id}`);
    }

    if (seg.type === 'text') {
      if (typeof seg.text !== 'string') {
        throw new Error(`[INVARIANT] Text segment missing text field at index ${i} in node ${node.id}`);
      }
      // Empty text segments are not allowed (they serve no purpose)
      if (seg.text.length === 0) {
        throw new Error(`[INVARIANT] Empty text segment at index ${i} in node ${node.id}`);
      }
    } else if (seg.type === 'inline') {
      if (!seg.kind || !seg.id) {
        throw new Error(`[INVARIANT] Inline segment missing required fields at index ${i} in node ${node.id}`);
      }
    } else {
      throw new Error(`[INVARIANT] Unknown segment type "${(seg as any).type}" at index ${i} in node ${node.id}`);
    }
  }
}

/**
 * Assert cursor position is valid
 * 
 * Enforces:
 * - segmentIndex is within bounds
 * - offset is non-negative
 * - offset is within segment bounds (for text segments)
 */
export function assertValidCursor(
  cursor: CursorPosition,
  node: Node
): asserts cursor is CursorPosition {
  const { segmentIndex, offset } = cursor;

  // Segment index must be non-negative
  if (segmentIndex < 0) {
    throw new Error(`[INVARIANT] Invalid segmentIndex ${segmentIndex} (must be >= 0)`);
  }

  // Offset must be non-negative
  if (offset < 0) {
    throw new Error(`[INVARIANT] Invalid offset ${offset} (must be >= 0)`);
  }

  // Segment index must be within bounds (can equal length for "after last segment")
  if (segmentIndex > node.segments.length) {
    throw new Error(
      `[INVARIANT] segmentIndex ${segmentIndex} out of bounds (segments.length: ${node.segments.length})`
    );
  }

  // If pointing to a text segment, offset must be within text bounds
  if (segmentIndex < node.segments.length) {
    const segment = node.segments[segmentIndex];
    if (segment && segment.type === 'text') {
      if (offset > segment.text.length) {
        throw new Error(
          `[INVARIANT] offset ${offset} exceeds text length ${segment.text.length} at segment ${segmentIndex}`
        );
      }
    }
  }
}

/**
 * Assert split operation preserves content
 * 
 * Enforces:
 * - head + tail segments concatenate to original
 * - No segments lost
 * - Order preserved
 */
export function assertSplitPreservesContent(
  original: readonly Segment[],
  head: readonly Segment[],
  tail: readonly Segment[]
): void {
  // Simple check: total segment count should match (may not be exact due to splits)
  // More importantly: plain text should be preserved
  const originalText = segmentsToPlainText(original);
  const splitText = segmentsToPlainText(head) + segmentsToPlainText(tail);

  if (originalText !== splitText) {
    throw new Error(
      `[INVARIANT] Split operation lost content.\nOriginal: "${originalText}"\nSplit: "${splitText}"`
    );
  }
}

/**
 * Assert merge operation preserves content
 * 
 * Enforces:
 * - merged segments equal concatenation of inputs
 * - No content lost
 * - Order preserved
 */
export function assertMergePreservesContent(
  upper: readonly Segment[],
  lower: readonly Segment[],
  merged: readonly Segment[]
): void {
  const expectedText = segmentsToPlainText(upper) + segmentsToPlainText(lower);
  const actualText = segmentsToPlainText(merged);

  if (expectedText !== actualText) {
    throw new Error(
      `[INVARIANT] Merge operation lost content.\nExpected: "${expectedText}"\nActual: "${actualText}"`
    );
  }
}

/**
 * Helper: Convert segments to plain text (for invariant checks)
 */
function segmentsToPlainText(segments: readonly Segment[]): string {
  return segments
    .map((seg) => {
      if (seg.type === 'text') return seg.text;
      if (seg.type === 'inline') return `@${seg.id}`;
      return '';
    })
    .join('');
}

/**
 * Assert segments array is immutable (DEV only)
 * 
 * Verifies that UI cannot mutate segments directly.
 * This is a development-time check.
 */
export function assertSegmentsImmutable(node: Node): void {
  if (process.env.NODE_ENV !== 'production') {
    try {
      // Try to mutate - should throw if properly frozen
      (node.segments as any).push({ type: 'text', text: 'test' });
      throw new Error('[INVARIANT] segments array is mutable! Must be readonly.');
    } catch (e: any) {
      // Expected: TypeError for frozen object
      if (e.message?.includes('INVARIANT')) {
        throw e; // Re-throw our own errors
      }
      // Success: mutation was prevented
    }
  }
}

/**
 * 🔒 RUNTIME GUARD: Call this after EVERY mutation
 * 
 * Combines all invariant checks in one call.
 */
export function assertNodeIntegrity(node: Node, cursor?: CursorPosition): void {
  assertValidNode(node);
  if (cursor) {
    assertValidCursor(cursor, node);
  }
}

/**
 * 🔒 RUNTIME GUARD: Call this before EVERY commit
 * 
 * Ensures state being committed is valid.
 */
export function assertCommitIntegrity(nodes: readonly Node[]): void {
  for (const node of nodes) {
    assertValidNode(node);
  }
}
