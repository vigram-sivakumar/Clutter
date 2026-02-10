/**
 * SegmentUtils — Utilities for Segmented Architecture
 * 
 * These are the ONLY allowed helpers for working with segments.
 * All grammar, queries, hashtags, and search MUST use getPlainText().
 * 
 * MANDATORY FUNCTIONS (4):
 * 1. getPlainText() - Reconstruct plain text from segments
 * 2. findSegmentAtPlainTextOffset() - Convert global offset to segment cursor
 * 3. getCursorOffsetInPlainText() - Convert segment cursor to global offset
 * 4. getInlineElements() - Find inline elements by kind
 */

import type { Segment } from './NodeKernel';

/**
 * Reconstruct plain text from segments
 * 
 * This is the ONLY way to get plain text from segments.
 * Used by: grammar detection, queries, hashtags, search.
 * 
 * Inline elements contribute ZERO width (same as old model).
 */
export function getPlainText(segments: Segment[]): string {
  return segments
    .filter(s => s.type === "text")
    .map(s => s.text)
    .join("");
}

/**
 * Convert plain text offset to segment cursor
 * 
 * Used by: Grammar commit (after detection in plain text)
 * 
 * Returns { segmentIndex, offset } for the given global text offset.
 */
export function findSegmentAtPlainTextOffset(
  segments: Segment[],
  globalOffset: number
): { segmentIndex: number; offset: number } {
  let remaining = globalOffset;
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg && seg.type === "text") {
      const len = seg.text.length;
      if (remaining <= len) {
        return { segmentIndex: i, offset: remaining };
      }
      remaining -= len;
    }
  }
  
  // Beyond end - return last position
  return { segmentIndex: segments.length - 1, offset: 0 };
}

/**
 * Convert segment cursor to plain text offset
 * 
 * Used by: Grammar detection (to pass offset to existing detection logic)
 * 
 * Returns global text offset for the given segment cursor.
 */
export function getCursorOffsetInPlainText(
  segments: Segment[],
  cursor: { segmentIndex: number; offset: number }
): number {
  let globalOffset = 0;
  
  for (let i = 0; i < cursor.segmentIndex; i++) {
    const seg = segments[i];
    if (seg && seg.type === "text") {
      globalOffset += seg.text.length;
    }
  }
  
  return globalOffset + cursor.offset;
}

/**
 * Find inline elements by kind
 * 
 * Used by: Queries (/ref), reference resolution, backlink computation.
 * 
 * Returns all inline segments matching the given kind.
 */
export function getInlineElements<K extends string>(
  segments: Segment[],
  kind: K
): Segment[] {
  return segments.filter(
    s => s.type === "inline" && s.kind === kind
  );
}
