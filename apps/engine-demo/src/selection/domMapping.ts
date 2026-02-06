/**
 * Phase 5.1 — DOM → Node Mapping
 * Pure utilities for translating browser selection to editor state
 */

import type { NodeID } from '../engine/NodeKernel';

type DOMNode = globalThis.Node;

/**
 * Normalize anchor node from element to text node
 *
 * When selection.anchorNode is an element (e.g., .node__content),
 * anchorOffset represents CHILD INDEX, not character offset.
 *
 * This function converts element anchor + child index into
 * text node + character offset for correct Range calculation.
 */
function normalizeAnchor(
  contentEl: HTMLElement,
  anchorNode: DOMNode,
  anchorOffset: number
): { node: DOMNode; offset: number } {
  // Case 1: Already a text node → use as-is
  if (anchorNode.nodeType === Node.TEXT_NODE) {
    return { node: anchorNode, offset: anchorOffset };
  }

  // Case 2: Element node → convert child index to text node + offset
  const walker = document.createTreeWalker(
    contentEl,
    NodeFilter.SHOW_TEXT,
    null
  );

  let currentTextNode: DOMNode | null = null;
  let remaining = anchorOffset;

  while ((currentTextNode = walker.nextNode())) {
    const len = currentTextNode.textContent?.length ?? 0;
    if (remaining <= len) {
      return { node: currentTextNode, offset: remaining };
    }
    remaining -= len;
  }

  // Fallback: end of content
  const last = contentEl.lastChild;
  return {
    node: last ?? contentEl,
    offset: last?.textContent?.length ?? 0,
  };
}

/**
 * Given a DOM node and offset, find the corresponding editor node and text offset.
 * Walks up from the target node to find the nearest .node__content element.
 *
 * CRITICAL: Normalizes element anchors to text nodes before Range calculation.
 * This handles the case where selection.anchorNode is .node__content itself.
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

  // Normalize anchor: element → text node (CRITICAL FIX)
  const { node: normalizedNode, offset: normalizedOffset } = normalizeAnchor(
    contentEl,
    target,
    offset
  );

  // --- Correct offset calculation using Range API ---
  // Now uses normalized text node for accurate measurement
  const range = document.createRange();
  range.selectNodeContents(contentEl);

  try {
    range.setEnd(normalizedNode, normalizedOffset);
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
