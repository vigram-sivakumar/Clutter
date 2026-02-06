/**
 * Phase 5.1 — DOM → Node Mapping
 * Pure utilities for translating browser selection to editor state
 */

import type { NodeID } from '../engine/NodeKernel';

type DOMNode = globalThis.Node;

/**
 * Given a DOM node and offset, find the corresponding editor node and text offset.
 * Walks up from the target node to find the nearest .node__content element.
 *
 * CRITICAL: Uses Range API to calculate correct offset within full node__content,
 * not just local text node offset. This is essential for rich DOM trees.
 */
export function getNodePositionFromDOM(
  target: DOMNode,
  offset: number
): { nodeId: NodeID; offset: number } | null {
  let node: DOMNode | null = target;

  // If text node, start from parent element
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentNode;
  }

  // Walk up until node__content
  while (
    node &&
    !(node instanceof HTMLElement && node.classList.contains('node__content'))
  ) {
    node = node.parentNode;
  }

  if (!(node instanceof HTMLElement)) return null;

  const contentEl = node;

  // data-node-id is directly on node__content (per directive)
  const nodeId = contentEl.getAttribute('data-node-id');
  if (!nodeId) return null;

  // --- Correct offset calculation using Range API ---
  // This measures offset within the FULL node__content, not just local text node
  const range = document.createRange();
  range.selectNodeContents(contentEl);

  try {
    range.setEnd(target, offset);
  } catch {
    // Defensive: browser edge cases
    return { nodeId, offset: contentEl.textContent?.length ?? 0 };
  }

  const text = range.toString();
  const clampedOffset = Math.max(
    0,
    Math.min(text.length, contentEl.textContent?.length ?? 0)
  );

  return { nodeId, offset: clampedOffset };
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
