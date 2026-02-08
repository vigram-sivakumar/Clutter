/**
 * SEGMENT OPERATIONS - ATOMIC PRIMITIVES
 * 
 * Pure functions for segment manipulation.
 * NO DOM. NO STATE. NO CURSOR LOGIC.
 * 
 * These are the building blocks for ALL text operations.
 * 
 * 🔒 HARDENING: All operations delegate to hardening layer for validation.
 */

import type { Node, Segment, NodeID } from '../engine/NodeKernel';
import { generateNodeId } from '../engine/NodeKernel';
import type { CursorPosition } from '../engine/EditorState';
import { performGuaranteedSplit } from '../hardening/split-state-machine';

export interface SplitResult {
  head: Node;
  tail: Node;
}

/**
 * Split node at segment cursor position
 * 
 * 🔒 SINGLE SOURCE OF TRUTH: Delegates to hardening layer's performGuaranteedSplit()
 * 
 * This ensures:
 * - Same logic for tests and production
 * - Automatic validation of content preservation
 * - Exhaustive case handling with compiler enforcement
 * - Impossible to introduce bugs through duplication
 */
export function splitNodeAtCursor(
  node: Node,
  segmentIndex: number,
  offset: number
): SplitResult {
  // Delegate to hardening layer - SINGLE implementation
  const cursor: CursorPosition = {
    nodeId: node.id,
    segmentIndex,
    offset,
  };
  
  const { head: headSegments, tail: tailSegments } = performGuaranteedSplit(
    node.segments,
    cursor
  );
  
  return {
    head: { ...node, segments: headSegments },
    tail: { ...node, id: generateNodeId(), segments: tailSegments }
  };
}

/**
 * Merge two nodes by concatenating segments
 * 
 * Upper node ID is preserved.
 * NO segment collapsing or text merging.
 */
export function mergeNodes(upper: Node, lower: Node): Node {
  return {
    ...upper,
    segments: [...upper.segments, ...lower.segments],
    props: {
      ...upper.props,
      ...(upper.props?.variant || lower.props?.variant 
        ? { variant: (upper.props?.variant || lower.props?.variant) as string }
        : {})
    }
  };
}

/**
 * Delete range within single text segment
 * 
 * Returns updated segment or null if segment should be removed.
 */
export function deleteInSegment(
  segment: Segment,
  start: number,
  end: number
): Segment | null {
  if (segment.type !== "text") {
    throw new Error("Cannot delete from non-text segment");
  }
  
  const newText = segment.text.slice(0, start) + segment.text.slice(end);
  
  if (newText.length === 0) {
    return null;
  }
  
  return { type: "text", text: newText };
}

/**
 * Insert text into text segment at offset
 */
export function insertInSegment(
  segment: Segment,
  offset: number,
  text: string
): Segment {
  if (segment.type !== "text") {
    throw new Error("Cannot insert into non-text segment");
  }
  
  return {
    type: "text",
    text: segment.text.slice(0, offset) + text + segment.text.slice(offset)
  };
}

/**
 * Replace segment at index in segments array
 */
export function replaceSegment(
  segments: Segment[],
  index: number,
  newSegment: Segment | null
): Segment[] {
  if (newSegment === null) {
    return [...segments.slice(0, index), ...segments.slice(index + 1)];
  }
  
  return [
    ...segments.slice(0, index),
    newSegment,
    ...segments.slice(index + 1)
  ];
}
