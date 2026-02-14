/**
 * ObserverCommit.ts
 * 
 * Pure functions for commit boundary operations.
 * 
 * COMMIT BOUNDARY CONTRACT:
 * 1. Stop observer
 * 2. Extract segments from DOM
 * 3. Read cursor from selection API
 * 4. Update state
 * 5. Clear diagnostics
 * 6. EXIT (React manages observer restart)
 * 
 * See: EDITOR-LIFECYCLE-CONTRACT.md
 */

import type { Segment, Node, NodeID, CursorPosition } from '../engine';
import { extractSegmentsFromDOM } from '../DOMObserver';
import type { ObserverMap } from './ObserverLifecycle';

/**
 * Result of a commit boundary operation
 */
export interface CommitResult {
  /**
   * Extracted segments from DOM
   */
  segments: Segment[];

  /**
   * Cursor position (if available)
   */
  cursor: CursorPosition | null;

  /**
   * Whether the observer was stopped
   */
  observerWasStopped: boolean;
}

/**
 * Perform commit boundary extraction for a single node
 * 
 * PURE FUNCTION - no side effects on state
 * 
 * Steps:
 * 1. Stop observer (if running)
 * 2. Extract segments from DOM
 * 3. Read cursor from selection API
 * 4. Clear diagnostics
 * 
 * @param nodeId - ID of node to extract
 * @param element - DOM element for the node
 * @param observers - Observer map
 * @param getNodeFromSegments - Function to construct a temporary node for cursor extraction
 * @returns Commit result with segments and cursor
 */
export function performCommitBoundary(
  nodeId: NodeID,
  element: HTMLElement,
  observers: ObserverMap,
  getNodeFromSegments: (nodeId: NodeID, segments: Segment[]) => Node
): CommitResult {
  // Step 1: Stop observer (graceful - may not exist if node unmounted)
  const observer = observers.get(nodeId);
  let observerWasStopped = false;

  if (observer) {
    observer.stop();
    observerWasStopped = true;
  }

  // Step 2: Extract segments from DOM
  const segments = extractSegmentsFromDOM(element);

  // Step 3: Read cursor from selection API
  const selection = window.getSelection();
  const cursor =
    selection && selection.rangeCount > 0
      ? getNodePositionFromSelection(getNodeFromSegments(nodeId, segments))
      : null;

  // Step 4: Clear diagnostics (if observer exists)
  if (observer) {
    observer.clearPendingMutations();
  }

  return {
    segments,
    cursor,
    observerWasStopped,
  };
}

/**
 * Extract cursor position from current browser selection
 * 
 * CRITICAL: This must be called at commit boundaries, not during typing.
 * The MutationObserver does NOT track cursor position.
 * 
 * @param node - Node to extract cursor position for
 * @returns Cursor position, or null if selection is outside the node
 */
export function getNodePositionFromSelection(node: Node): CursorPosition | null {
  const selection = window.getSelection();
  if (!selection || !selection.focusNode) return null;

  // Find the contentEditable element for this node
  const element = document.querySelector(
    `[data-node-id="${node.id}"]`
  ) as HTMLElement;
  if (!element) return null;

  // Check if selection is inside this node
  if (!element.contains(selection.focusNode)) return null;

  // 🔍 DEBUG: Log browser selection state

  // Initialize cursor position variables
  let segmentIndex = 0;
  let offset = 0;

  // Simple case: selection is in a text node
  if (selection.focusNode.nodeType === Node.TEXT_NODE) {
    const children = Array.from(element.childNodes);
    const focusChild = children.find(
      (child) =>
        child === selection.focusNode ||
        child.contains(selection.focusNode)
    );

    if (!focusChild) return null;

    // Find which segment this text node belongs to
    const childIndex = children.indexOf(focusChild);
    let currentSegmentIndex = 0;

    for (let i = 0; i < childIndex; i++) {
      const child = children[i];
      if (child?.nodeType === Node.TEXT_NODE) {
        currentSegmentIndex++;
      } else if (
        (child as HTMLElement).classList?.contains('inline-element')
      ) {
        currentSegmentIndex++;
      }
    }

    segmentIndex = currentSegmentIndex;
    offset = selection.focusOffset;
  }
  // Complex case: selection is around an inline element (caret-anchor)
  else if (selection.focusNode.nodeType === Node.ELEMENT_NODE) {
    const focusElement = selection.focusNode as HTMLElement;

    // If focus is on a caret-anchor, find which segment it's before
    if (focusElement.classList?.contains('caret-anchor')) {
      const children = Array.from(element.childNodes);
      const childIndex = children.indexOf(focusElement);

      let currentSegmentIndex = 0;
      for (let i = 0; i < childIndex; i++) {
        const child = children[i];
        if (child?.nodeType === Node.TEXT_NODE) {
          currentSegmentIndex++;
        } else if (
          (child as HTMLElement).classList?.contains('inline-element')
        ) {
          currentSegmentIndex++;
        }
      }

      segmentIndex = currentSegmentIndex;
      offset = 0;
    }
    // CRITICAL: When focusNode is the contenteditable div itself
    else if (focusElement === element) {
      // Cursor is placed relative to the element's children
      const childIndex = selection.focusOffset;
      const children = Array.from(element.childNodes);

      // Count segments up to this child index
      let currentSegmentIndex = 0;
      for (let i = 0; i < childIndex; i++) {
        const child = children[i];
        if (child?.nodeType === Node.TEXT_NODE) {
          currentSegmentIndex++;
        } else if (
          (child as HTMLElement).classList?.contains('inline-element')
        ) {
          currentSegmentIndex++;
        }
      }
      
      // If focusOffset points beyond all children, cursor is "after everything"
      if (childIndex >= children.length) {
        segmentIndex = node.segments.length; // After all segments
        offset = 0;

      } else {
        segmentIndex = currentSegmentIndex;
        offset = 0;
      }
    }
  }

  const result = {
    nodeId: node.id,
    segmentIndex,
    offset,
  };

  return result;
}

/**
 * Verify observer is stopped before commit (dev assertion)
 * 
 * @param nodeId - Node ID being committed
 * @param observers - Observer map
 * @returns True if check passed, false if observer still running
 */
export function assertObserverStopped(
  nodeId: NodeID,
  observers: ObserverMap
): boolean {
  const observer = observers.get(nodeId);
  if (observer && observer.isRunning()) {

    return false;
  }
  return true;
}
