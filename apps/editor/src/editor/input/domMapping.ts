/**
 * SEGMENTED ARCHITECTURE — DOM → State Mapping
 *
 * STRICT CONTRACT (NON-NEGOTIABLE):
 * - Cursor NEVER invents position
 * - Cursor ONLY reads from DOM structure
 * - NO TreeWalker
 * - NO heuristics
 * - NO bias detection
 * - Caret-anchors identified by CLASS ONLY
 *
 * DOM sibling order + caret-anchor class = ground truth.
 */

import type { Node, NodeID } from '../../engine/NodeKernel';
import type { CursorPosition } from '../../engine/EditorState';

type DOMNode = globalThis.Node;

/**
 * SEGMENTED ARCHITECTURE — Selection Reading (EXACT ALGORITHM)
 *
 * Maps browser selection to CursorPosition {nodeId, segmentIndex, offset}.
 *
 * FORBIDDEN:
 * - TreeWalker
 * - Offset accumulation
 * - Skipping nodes
 * - Filtering inline text
 * - DOM traversal heuristics
 * - Inferring intent
 *
 * CARET-ANCHOR IDENTIFICATION (NON-NEGOTIABLE):
 * Identify ONLY by: element.classList.contains("caret-anchor")
 *
 * FOUR CASES (ONLY ALLOWED):
 * A. anchorNode IS a caret-anchor
 * B. anchorNode is INSIDE a caret-anchor
 * C. anchorNode is TEXT_NODE (normal typing)
 * D. anchorNode is EMPTY contenteditable container (all text deleted)
 */
export function getNodePositionFromSelection(
  currentNode: Node
): CursorPosition | null {
  const sel = window.getSelection();

  if (!sel || !sel.isCollapsed) {
    return null;
  }

  const anchor = sel.anchorNode;

  if (!anchor) {
    return null;
  }

  // CASE A: anchorNode IS a caret anchor
  if (
    anchor.nodeType === Node.ELEMENT_NODE &&
    (anchor as HTMLElement).classList.contains('caret-anchor')
  ) {
    // Cursor is at segment boundary
    // segmentIndex derived from DOM sibling order
    // offset is ALWAYS 0
    const segmentIndex = getSegmentIndexFromCaretAnchor(anchor as HTMLElement);
    const result = { nodeId: currentNode.id, segmentIndex, offset: 0 };

    return result;
  }

  // CASE B: anchorNode is INSIDE a caret anchor
  if (
    anchor.nodeType === Node.TEXT_NODE &&
    anchor.parentElement?.classList.contains('caret-anchor')
  ) {
    // 🔒 UNBREAKABLE FIX: Use actual anchorOffset, not 0
    // When browser puts text inside caret-anchor, we extract that text as a segment
    // Cursor position must reflect the actual offset within that text
    const segmentIndex = getSegmentIndexFromCaretAnchor(anchor.parentElement);
    const result = { 
      nodeId: currentNode.id, 
      segmentIndex, 
      offset: sel.anchorOffset  // Use ACTUAL offset, not 0
    };

    return result;
  }

  // CASE C: anchorNode is TEXT NODE (normal typing)
  if (anchor.nodeType === Node.TEXT_NODE) {
    const segmentIndex = getSegmentIndexFromTextNode(anchor);

    if (segmentIndex === -1) {

      return null;
    }

    const result = {
      nodeId: currentNode.id,
      segmentIndex,
      offset: sel.anchorOffset,
    };

    return result;
  }

  // CASE D: Cursor on contenteditable container itself
  // This happens when:
  // - Node is empty (no segments, has placeholder text node)
  // - Cursor is placed after all children (after last inline element)
  // - User clicks in empty node area
  // This is NORMAL browser behavior for contenteditable elements
  if (
    anchor.nodeType === Node.ELEMENT_NODE &&
    (anchor as HTMLElement).classList?.contains('node__content')
  ) {
    const containerEl = anchor as HTMLElement;
    const childIndex = sel.anchorOffset; // Which child the cursor is positioned at/after
    const children = Array.from(containerEl.childNodes);
    
    // Empty node handling (has placeholder empty text node)
    if (children.length === 1 && children[0]?.nodeType === Node.TEXT_NODE && children[0]?.textContent === '') {

      return {
        nodeId: currentNode.id,
        segmentIndex: 0,
        offset: 0,
      };
    }
    
    // Truly empty node (no children at all)
    if (children.length === 0) {

      return {
        nodeId: currentNode.id,
        segmentIndex: 0,
        offset: 0,
      };
    }
    
    // Count segments up to the cursor position
    let segmentIndex = 0;
    for (let i = 0; i < childIndex && i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === Node.TEXT_NODE) {
        segmentIndex++;
      } else if ((child as HTMLElement).classList?.contains('inline-element')) {
        segmentIndex++;
      }
      // Skip caret-anchors - they don't correspond to segments
    }
    
    // If childIndex >= children.length, cursor is after all children
    if (childIndex >= children.length) {
      segmentIndex = currentNode.segments.length; // After all segments
    }

    return {
      nodeId: currentNode.id,
      segmentIndex,
      offset: 0,
    };
  }

  // If none match → return null (silence > corruption)
  return null;
}

/**
 * Helper: Find segment index from caret-anchor DOM position
 *
 * Caret anchors appear before AND after inline elements.
 * Count preceding children to determine which segment this anchor represents.
 */
function getSegmentIndexFromCaretAnchor(anchorEl: HTMLElement): number {
  const contentEl = anchorEl.parentElement;
  if (!contentEl) return 0;

  let segmentIndex = 0;
  let child = contentEl.firstChild;

  while (child && child !== anchorEl) {
    if (child.nodeType === Node.TEXT_NODE) {
      segmentIndex++;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const elem = child as HTMLElement;
      if (elem.classList.contains('inline-element')) {
        segmentIndex++;
      }
      // Skip other caret-anchors (don't count as segments)
    }
    child = child.nextSibling;
  }

  return segmentIndex;
}

/**
 * Helper: Find segment index from text node position
 *
 * Walk DOM backwards from text node, counting segments.
 */
function getSegmentIndexFromTextNode(textNode: DOMNode): number {
  const contentEl = textNode.parentElement;
  if (!contentEl) return -1;

  let segmentIndex = 0;
  let child = contentEl.firstChild;

  while (child) {
    if (child === textNode) {
      return segmentIndex;
    }

    if (child.nodeType === Node.TEXT_NODE) {
      segmentIndex++;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const elem = child as HTMLElement;
      if (elem.classList.contains('inline-element')) {
        segmentIndex++;
      }
      // Skip caret-anchors (don't count as segments)
    }

    child = child.nextSibling;
  }

  return -1;
}

/**
 * LEGACY: Get selection range (for multi-node selection)
 *
 * NOT YET MIGRATED TO SEGMENTED ARCHITECTURE.
 * This function will be updated in a future phase to support segment-based selection.
 *
 * For now, returns null to indicate segmented selection not yet implemented.
 */
export function getSelectionRangeFromDOM(selection: Selection): {
  anchor: CursorPosition;
  focus: CursorPosition;
} | null {
  // TODO: Implement segmented selection range
  // For now, multi-node selection not supported in segmented mode
  return null;
}
