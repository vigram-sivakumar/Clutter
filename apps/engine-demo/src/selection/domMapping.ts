/**
 * Phase 5.1 — DOM → Node Mapping
 * Pure utilities for translating browser selection to editor state
 */

import type { NodeID } from '../engine/NodeKernel';

/**
 * Get node position from DOM selection
 *
 * Walks up DOM tree to find node__content, extracts data-node-id
 * Returns null if outside editor
 */
export function getNodePositionFromDOM(
  target: Node,
  offset: number
): { nodeId: NodeID; offset: number } | null {
  let element = target as HTMLElement;

  // If target is text node, get parent element
  if (element.nodeType === Node.TEXT_NODE) {
    element = element.parentElement!;
  }

  // Walk up until we find node__content
  while (element && !element.classList?.contains('node__content')) {
    element = element.parentElement!;
    if (!element) return null;
  }

  if (!element) return null;

  // Get node ID from parent .node element
  const nodeElement = element.closest('.node');
  if (!nodeElement) return null;

  const nodeId = nodeElement.getAttribute('data-node-id');
  if (!nodeId) return null;

  // Clamp offset to text length
  const textContent = element.textContent || '';
  const clampedOffset = Math.max(0, Math.min(offset, textContent.length));

  return {
    nodeId,
    offset: clampedOffset,
  };
}

/**
 * Get node position from browser Selection object
 */
export function getNodePositionFromSelection(
  selection: Selection
): { nodeId: NodeID; offset: number } | null {
  if (!selection.anchorNode) return null;
  return getNodePositionFromDOM(selection.anchorNode, selection.anchorOffset);
}

/**
 * Get selection range from browser Selection object
 */
export function getSelectionRangeFromDOM(selection: Selection): {
  anchor: { nodeId: NodeID; offset: number };
  focus: { nodeId: NodeID; offset: number };
} | null {
  if (!selection.anchorNode || !selection.focusNode) return null;

  const anchor = getNodePositionFromDOM(
    selection.anchorNode,
    selection.anchorOffset
  );
  const focus = getNodePositionFromDOM(
    selection.focusNode,
    selection.focusOffset
  );

  if (!anchor || !focus) return null;

  return { anchor, focus };
}
