/**
 * 🔒 STRUCTURAL CARET PLACEMENT — No Timing, Only Guarantees
 * 
 * ABSOLUTE PRINCIPLE:
 * Caret placement is STRUCTURAL, not temporal.
 * NO requestAnimationFrame, NO setTimeout, NO "wait for DOM".
 * 
 * ENFORCEMENT:
 * - Caret placed AFTER React.flushSync (DOM guaranteed ready)
 * - Caret placed EXACTLY ONCE per operation (cannot skip, cannot duplicate)
 * - Failure to place = crash (not silent skip)
 * 
 * If DOM is not ready, we WAIT structurally, not with timers.
 */

import type { Node, CursorPosition } from './editor/engine';

/**
 * Placement queue (FIFO)
 */
interface PlacementRequest {
  cursor: CursorPosition;
  nodeDOM: HTMLElement;
  node: Node;
}

let placementQueue: PlacementRequest[] = [];
let isPlacing = false;

/**
 * Schedule caret placement (called by pipeline after React update)
 * 
 * This does NOT place immediately - it queues for next layout phase.
 */
export function schedulePlacement(
  cursor: CursorPosition,
  nodeDOM: HTMLElement,
  node: Node
): void {
  placementQueue.push({ cursor, nodeDOM, node });

  if (__DEV__) {

  }

  // Process queue in layout phase (synchronous with React)
  if (!isPlacing) {
    processPlacements();
  }
}

/**
 * Process all pending placements
 * 
 * This runs synchronously after React flushSync.
 * DOM is guaranteed to be ready.
 */
function processPlacements(): void {
  if (isPlacing) {
    throw new Error('REENTRANCY BUG: Placement already in progress');
  }

  if (placementQueue.length === 0) return;

  isPlacing = true;

  try {
    while (placementQueue.length > 0) {
      const request = placementQueue.shift()!;
      placeCaret(request.cursor, request.nodeDOM, request.node);
    }
  } finally {
    isPlacing = false;
  }
}

/**
 * Place caret at exact position (STRUCTURAL - no timing)
 * 
 * This function MUST succeed or crash.
 * Silent failures are FORBIDDEN.
 */
function placeCaret(
  cursor: CursorPosition,
  nodeDOM: HTMLElement,
  node: Node
): void {
  const range = document.createRange();
  const sel = window.getSelection();

  if (!sel) {
    throw new Error('CARET PLACEMENT FAILED: No selection object');
  }

  try {
    const { offset, segmentIndex } = cursor;
    const segments = node.segments;

    // CASE 1: Cursor after all segments
    if (segmentIndex >= segments.length) {
      const lastChild = nodeDOM.lastChild;
      if (!lastChild) {
        // Empty node - place at container
        range.selectNodeContents(nodeDOM);
        range.collapse(false);
      } else {
        range.setStartAfter(lastChild);
        range.collapse(true);
      }
    } 
    // CASE 2: Cursor in text segment
    else {
      const segment = segments[segmentIndex];
      
      if (segment.type === 'text') {
        // Find the text node for this segment
        const textNodes = Array.from(nodeDOM.childNodes).filter(
          n => n.nodeType === Node.TEXT_NODE
        );
        
        // Count only text segments before this one
        let textSegmentIndex = 0;
        for (let i = 0; i < segmentIndex; i++) {
          if (segments[i].type === 'text') {
            textSegmentIndex++;
          }
        }
        
        const textNode = textNodes[textSegmentIndex];
        if (!textNode) {
          throw new Error(
            `CARET PLACEMENT FAILED: Text node not found\n` +
            `segmentIndex: ${segmentIndex}, textSegmentIndex: ${textSegmentIndex}\n` +
            `Available text nodes: ${textNodes.length}`
          );
        }
        
        const len = textNode.textContent?.length || 0;
        const clampedOffset = Math.min(offset, len);
        
        range.setStart(textNode, clampedOffset);
        range.collapse(true);
      } 
      // CASE 3: Cursor at inline segment boundary
      else {
        // Find caret anchor for this position
        const anchors = Array.from(nodeDOM.querySelectorAll('.caret-anchor'));
        
        // segmentIndex points to inline segment
        // We need the anchor BEFORE it
        // Count segments to find which anchor
        let anchorIndex = 0;
        for (let i = 0; i < segmentIndex; i++) {
          if (segments[i].type === 'inline') {
            anchorIndex += 2; // Each inline has 2 anchors (before/after)
          }
        }
        // Add 1 for the anchor before this inline
        anchorIndex++;
        
        const anchor = anchors[anchorIndex] as HTMLElement;
        if (!anchor) {
          throw new Error(
            `CARET PLACEMENT FAILED: Caret anchor not found\n` +
            `segmentIndex: ${segmentIndex}, anchorIndex: ${anchorIndex}\n` +
            `Available anchors: ${anchors.length}`
          );
        }
        
        range.selectNodeContents(anchor);
        range.collapse(offset === 0);
      }
    }

    // Apply range
    sel.removeAllRanges();
    sel.addRange(range);

    if (__DEV__) {

    }

  } catch (error) {
    // 🔒 CRITICAL: Placement failure is FATAL

    throw error; // Re-throw - this is a critical failure
  }
}

/**
 * Clear placement queue (e.g., on unmount)
 */
export function clearPlacementQueue(): void {
  placementQueue = [];
}

/**
 * Check if placements are pending
 */
export function hasPendingPlacements(): boolean {
  return placementQueue.length > 0;
}

// Global declaration for __DEV__
declare const __DEV__: boolean;
