/**
 * CaretPlacement.tsx
 * 
 * React hook for managing caret placement after structural operations.
 * 
 * CRITICAL INVARIANTS:
 * - Handlers declare intent synchronously (before commit)
 * - Effect owns all timing and retry logic
 * - DOM readiness is respected (bounded retries)
 * - Caret never placed during typing (only after structural ops)
 * 
 * See: EDITOR-LIFECYCLE-CONTRACT.md
 */

import { useEffect } from 'react';
import { scheduleRAF } from './CaretUtilities';
import type { Node, Segment, CursorPosition } from '../engine';

/**
 * Hook options
 */
export interface UseCaretPlacementOptions {
  /**
   * Current cursor position
   */
  cursor: CursorPosition;

  /**
   * All nodes in the editor (needed to find active node)
   */
  nodes: Node[];

  /**
   * Ref to control when caret placement should occur
   * Handlers set this to true, effect consumes it
   */
  needsPlacementRef: React.MutableRefObject<boolean>;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Max retries before abandoning
   * @default 10
   */
  maxRetries?: number;
}

/**
 * Places caret in DOM after structural operations
 * 
 * CONTRACT:
 * - Handlers call `needsPlacementRef.current = true` BEFORE committing
 * - Effect runs after React commit
 * - Effect retries until DOM is ready (bounded)
 * - Effect clears flag after successful placement
 * 
 * USAGE:
 * ```typescript
 * const needsCaretPlacementRef = useRef(false);
 * 
 * useCaretPlacement({
 *   cursor: editorState.cursor,
 *   nodes: editorState.nodes,
 *   needsPlacementRef,
 *   debug: __DEV__,
 * });
 * 
 * // In handler:
 * needsCaretPlacementRef.current = true;
 * commit({ ... });
 * ```
 * 
 * @param options - Configuration options
 */
export function useCaretPlacement(options: UseCaretPlacementOptions): void {
  const {
    cursor,
    nodes,
    needsPlacementRef,
    debug = false,
    maxRetries = 10,
  } = options;

  useEffect(() => {
    if (!needsPlacementRef.current) return;

    let cancelled = false;

    const tryPlace = (retries = 0) => {
      if (cancelled) return;

      // Safety: Abandon after max retries (prevent infinite RAF loop)
      if (retries > maxRetries) {

        needsPlacementRef.current = false;
        return;
      }

      // Find active node in state
      const activeNode = nodes.find((n) => n.id === cursor.nodeId);
      if (!activeNode) {

        needsPlacementRef.current = false;
        return;
      }

      // Find DOM element
      const nodeElement = document.querySelector(
        `[data-node-id="${cursor.nodeId}"]`
      );

      if (!nodeElement) {
        // DOM not ready yet - retry next frame (bounded by retry limit)
        scheduleRAF(() => tryPlace(retries + 1));
        return;
      }

      // Ensure element is focused
      if (document.activeElement !== nodeElement) {
        (nodeElement as HTMLElement).focus();
      }

      const range = document.createRange();
      const sel = window.getSelection();
      if (!sel) {
        needsPlacementRef.current = false;
        return;
      }

      try {
        placeCaretInNode(nodeElement as HTMLElement, activeNode, cursor, debug);
      } catch (err) {
        // Silent fail
      }

      needsPlacementRef.current = false;
    };

    // Start AFTER React commit (single RAF, effect owns all timing)
    scheduleRAF(() => tryPlace());

    return () => {
      cancelled = true;
    };
  }, [cursor, nodes, needsPlacementRef, debug, maxRetries]);
}

/**
 * Place caret at specific position within a node
 * 
 * Handles both text segments and inline elements with caret-anchors.
 * 
 * @param nodeElement - DOM element for the node
 * @param node - Node data with segments
 * @param cursor - Cursor position within node
 * @param debug - Enable debug logging
 */
function placeCaretInNode(
  nodeElement: HTMLElement,
  node: Node,
  cursor: CursorPosition,
  debug: boolean
): void {
  const sel = window.getSelection();
  if (!sel) return;

  const range = document.createRange();

  const { offset, segmentIndex } = cursor;
  const segments = node.segments;

  // Case 1: Cursor at end (past all segments) OR empty node
  if (segmentIndex >= segments.length) {
    const lastChild = nodeElement.lastChild;
    
    // 🔬 FORENSIC LOG 4: CaretPlacement Edge Case
    if (__DEV__) {

    }
    
    if (lastChild) {
      // 🔒 FIX: If lastChild is an empty text node (placeholder for empty nodes),
      // place cursor INSIDE it for stable selection
      if (lastChild.nodeType === Node.TEXT_NODE && lastChild.textContent === '') {
        range.setStart(lastChild, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        // Normal case: place cursor after last child
        range.setStartAfter(lastChild);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else {

    }
    return;
  }

  const segment = segments[segmentIndex];
  if (!segment) {

    return;
  }

  // Case 2: Inline segment at offset 0 - use caret-anchor
  if (segment.type === 'inline' && offset === 0) {
    placeCaretBeforeInline(nodeElement, segments, segmentIndex, sel, range, debug);
    return;
  }

  // Case 3: Text segment - find text node
  placeCaretInText(nodeElement, segments, segmentIndex, offset, sel, range, debug);
}

/**
 * Place caret before an inline element using caret-anchor
 * 
 * DOM structure: <span.caret-anchor/><span.inline/><span.caret-anchor/>
 * 
 * @param nodeElement - DOM element for the node
 * @param segments - All segments in the node
 * @param segmentIndex - Index of inline segment
 * @param sel - Window selection
 * @param range - Range to modify
 * @param debug - Enable debug logging
 */
function placeCaretBeforeInline(
  nodeElement: HTMLElement,
  segments: Segment[],
  segmentIndex: number,
  sel: Selection,
  range: Range,
  debug: boolean
): void {
  const children = Array.from(nodeElement.childNodes);
  let domIndex = 0;

  // Walk through segments to find DOM position
  for (let i = 0; i < segmentIndex; i++) {
    const seg = segments[i];
    if (seg?.type === 'text') {
      domIndex++; // TEXT_NODE
    } else if (seg) {
      domIndex += 3; // caret-anchor + inline + caret-anchor
    }
  }

  // domIndex now points to the caret-anchor before our inline
  const caretAnchor = children[domIndex];
  if (
    caretAnchor &&
    (caretAnchor as HTMLElement).classList?.contains('caret-anchor')
  ) {
    // Place cursor inside the caret-anchor (it's a focusable span)
    range.setStart(caretAnchor, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {

  }
}

/**
 * Place caret in text segment
 * 
 * @param nodeElement - DOM element for the node
 * @param segments - All segments in the node
 * @param segmentIndex - Index of text segment
 * @param offset - Character offset within text
 * @param sel - Window selection
 * @param range - Range to modify
 * @param debug - Enable debug logging
 */
function placeCaretInText(
  nodeElement: HTMLElement,
  segments: Segment[],
  segmentIndex: number,
  offset: number,
  sel: Selection,
  range: Range,
  debug: boolean
): void {
  const children = Array.from(nodeElement.childNodes);
  let domIndex = 0;

  // Walk through segments to find DOM position
  for (let i = 0; i < segmentIndex; i++) {
    const seg = segments[i];
    if (seg?.type === 'text') {
      domIndex++; // TEXT_NODE
    } else if (seg) {
      domIndex += 3; // caret-anchor + inline + caret-anchor
    }
  }

  // domIndex now points to our text node
  const textNode = children[domIndex];
  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
    const len = textNode.textContent?.length || 0;
    range.setStart(textNode, Math.min(offset, len));
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {

  }
}
