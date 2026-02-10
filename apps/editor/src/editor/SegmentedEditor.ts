/**
 * SEGMENTED EDITOR - CORE TEXT OPERATIONS
 *
 * This module contains ALL text manipulation logic.
 * NodeEditor.tsx must NEVER touch node.segments directly.
 *
 * PUBLIC API ONLY - no exports beyond these functions.
 */

import type { Node } from '../engine/NodeKernel';
import type { CursorPosition } from '../engine/EditorState';
import { splitNodeAtCursor, mergeNodes } from './SegmentOps';
import { getPlainText, findSegmentAtPlainTextOffset } from '../engine/SegmentUtils';

export interface EnterResult {
  head: Node;
  tail: Node;
  cursor: CursorPosition;
}

export interface BackspaceResult {
  node: Node;
  cursor: CursorPosition;
  shouldMergeWithPrevious: boolean;
}

export interface InputResult {
  node: Node;
  cursor: CursorPosition;
}

/**
 * Handle Enter key press
 *
 * Implements MOVE-TAIL semantics:
 * - Original node keeps HEAD segments
 * - New node gets TAIL segments
 * - Cursor moves to new node at {segmentIndex: 0, offset: 0}
 */
export function handleSegmentedEnter(
  node: Node,
  cursor: CursorPosition
): EnterResult {
  const { segmentIndex, offset } = cursor;

  const { head, tail } = splitNodeAtCursor(node, segmentIndex, offset);

  return {
    head,
    tail,
    cursor: {
      nodeId: tail.id,
      segmentIndex: 0,
      offset: 0,
    },
  };
}

/**
 * Handle Backspace key press
 *
 * ONLY handles offset === 0 case (merge with previous node).
 * All other cases are handled by browser contenteditable.
 *
 * Returns:
 * - shouldMergeWithPrevious: true if cursor at start of node
 * - Otherwise returns unchanged node
 */
export function handleSegmentedBackspace(
  node: Node,
  cursor: CursorPosition
): BackspaceResult {
  const { segmentIndex, offset } = cursor;

  // At start of node → signal merge needed
  if (segmentIndex === 0 && offset === 0) {
    return {
      node,
      cursor,
      shouldMergeWithPrevious: true,
    };
  }

  // Browser handles all other cases
  return {
    node,
    cursor,
    shouldMergeWithPrevious: false,
  };
}

/**
 * Handle Delete key press
 *
 * ONLY handles offset === end of node case (merge with next node).
 * All other cases are handled by browser contenteditable.
 */
export function handleSegmentedDelete(
  node: Node,
  cursor: CursorPosition
): { node: Node; cursor: CursorPosition; shouldMergeWithNext: boolean } {
  const { segmentIndex, offset } = cursor;
  const segment = node.segments[segmentIndex];

  // At end of node → signal merge needed
  const isAtEnd =
    segmentIndex === node.segments.length - 1 &&
    segment?.type === 'text' &&
    offset === segment.text.length;

  if (isAtEnd || segmentIndex === node.segments.length) {
    return {
      node,
      cursor,
      shouldMergeWithNext: true,
    };
  }

  // Browser handles all other cases
  return {
    node,
    cursor,
    shouldMergeWithNext: false,
  };
}

/**
 * 🔒 NORMALIZE TEXT — Remove browser DOM artifacts
 *
 * Browsers insert \u00A0 (non-breaking space) into empty contenteditable elements.
 * This is a DOM caret helper, NOT content.
 *
 * Rules:
 * - \u00A0 → normal space
 * - Whitespace-only → empty string (no segment)
 * - Leading/trailing whitespace preserved for real text
 */
function normalizeText(text: string): string {
  // Convert NBSP to normal space
  const normalized = text.replace(/\u00A0/g, ' ');

  // Return empty string if only whitespace
  return normalized.trim().length === 0 ? '' : normalized;
}

/**
 * Sync node segments from DOM content
 *
 * This is called by input observer after DOM changes.
 * Reconstructs segments array from contenteditable DOM.
 *
 * MANDATORY: Preserve inline elements, update only text.
 */
export function handleSegmentedInput(
  node: Node,
  cursor: CursorPosition,
  dom: HTMLElement
): InputResult {
  // Get all child nodes from contenteditable
  const children = Array.from(dom.childNodes);
  const newSegments: typeof node.segments = [];

  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      const raw = child.textContent || '';
      const text = normalizeText(raw);

      // Only create segment if normalized text is non-empty
      if (text.length > 0) {
        newSegments.push({ type: 'text', text });
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const elem = child as HTMLElement;

      // Skip caret anchors
      if (elem.classList.contains('caret-anchor')) {
        continue;
      }

      // Preserve inline elements
      if (elem.classList.contains('inline-element')) {
        const inlineId = elem.dataset.inlineId;
        const kind =
          elem.className
            .split(' ')
            .find((c) => c.startsWith('inline-'))
            ?.replace('inline-', '') || 'ref';

        if (inlineId) {
          newSegments.push({
            type: 'inline',
            kind: kind as any,
            id: inlineId,
            payload: { type: 'reference', targetId: inlineId },
          });
        }
      }
    }
  }

  // Return updated segments (caller decides whether to buffer or commit)
  return {
    node: { ...node, segments: newSegments },
    cursor,
  };
}

/**
 * Merge current node with previous node
 *
 * Used after Backspace at start of node.
 * Returns merged node with cursor at junction point.
 */
export function mergeWithPrevious(
  previous: Node,
  current: Node
): { merged: Node; cursor: CursorPosition } {
  // 🔍 UNCONDITIONAL DEBUG: Verify function is called
  console.log('🔀 [MERGE] mergeWithPrevious called', {
    previousId: previous.id,
    currentId: current.id,
    previousSegments: previous.segments.length,
    currentSegments: current.segments.length
  });
  
  const merged = mergeNodes(previous, current);

  // 🔒 UNBREAKABLE: Cursor at junction = where current node's content starts
  // Junction is at index previous.segments.length
  // Place cursor EXACTLY at junction, even if it's an inline element
  // (Caret will be in the caret-anchor before the inline)
  
  const junctionIndex = previous.segments.length;
  
  // 🔒 CRITICAL FIX: When current is empty, junction = end of previous
  // Case 1: Current has segments -> cursor at junction (start of current's content)
  // Case 2: Current is empty -> cursor at junction (after previous's content)
  //         Even if junction = segments.length (after last segment)
  
  if (junctionIndex < merged.segments.length) {
    // Case 1: Junction points to a segment (current had content)
    const result = {
      merged,
      cursor: {
        nodeId: merged.id,
        segmentIndex: junctionIndex,
        offset: 0,
      },
    };
    
    console.log('🔀 [MERGE] Case 1: Junction at segment', {
      junctionIndex,
      junctionSegment: merged.segments[junctionIndex],
      cursor: result.cursor
    });
    
    return result;
  }
  
  // Case 2: Junction is at/after the end (current was empty or at boundary)
  // Need to place cursor "after" the last segment
  const lastSegment = merged.segments[merged.segments.length - 1];
  
  if (!lastSegment) {
    // No segments at all - cursor at start
    console.log('🔀 [MERGE] Case 2a: No segments, cursor at start');
    return {
      merged,
      cursor: { nodeId: merged.id, segmentIndex: 0, offset: 0 }
    };
  }
  
  if (lastSegment.type === 'text') {
    // Last segment is text - cursor at end of text
    const result = {
      merged,
      cursor: {
        nodeId: merged.id,
        segmentIndex: merged.segments.length - 1,
        offset: lastSegment.text.length
      }
    };
    console.log('🔀 [MERGE] Case 2b: Last segment is text, cursor at end', {
      lastSegmentIndex: merged.segments.length - 1,
      textLength: lastSegment.text.length,
      cursor: result.cursor
    });
    return result;
  }
  
  // Last segment is inline - cursor "after" it (segmentIndex beyond array)
  const result = {
    merged,
    cursor: {
      nodeId: merged.id,
      segmentIndex: merged.segments.length, // One past the end = "after last segment"
      offset: 0
    }
  };
  console.log('🔀 [MERGE] Case 2c: Last segment is inline, cursor after it', JSON.stringify({
    lastSegmentIndex: merged.segments.length - 1,
    inlineRef: lastSegment.ref,
    cursorSegmentIndex: merged.segments.length,
    cursor: result.cursor
  }, null, 2));
  return result;
  
  // OLD FALLBACK (should never reach here)
  for (let i = merged.segments.length - 1; i >= 0; i--) {
    if (merged.segments[i]?.type === 'text') {
      return {
        merged,
        cursor: {
          nodeId: merged.id,
          segmentIndex: i,
          offset: merged.segments[i].text.length,
        },
      };
    }
  }
  
  // No text segments at all (only inlines or empty)
  // Place cursor at position 0
  return {
    merged,
    cursor: {
      nodeId: merged.id,
      segmentIndex: 0,
      offset: 0,
    },
  };
}

/**
 * Merge current node with next node
 *
 * Used after Delete at end of node.
 * Returns merged node with cursor at original position.
 */
export function mergeWithNext(
  current: Node,
  next: Node,
  cursor: CursorPosition
): { merged: Node; cursor: CursorPosition } {
  const merged = mergeNodes(current, next);

  return {
    merged,
    cursor: {
      ...cursor,
      nodeId: merged.id,
    },
  };
}
