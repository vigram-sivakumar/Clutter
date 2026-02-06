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
 * Phase 09 Fix — Uses TreeWalker to count ONLY TEXT_NODE characters.
 * Reference spans (contenteditable=false) are skipped, counting as zero width.
 * This ensures logical offset maps cleanly to node.text (pure string).
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

  // --- Phase 09 — TreeWalker-based offset (TEXT_NODE only) ---
  // This skips reference spans and counts only text characters
  let logicalOffset = 0;

  // If target is a TEXT_NODE, count characters up to and including offset
  if (target.nodeType === Node.TEXT_NODE) {
    const walker = document.createTreeWalker(
      contentEl,
      NodeFilter.SHOW_TEXT,
      null
    );

    let current: DOMNode | null = walker.nextNode();

    while (current) {
      if (current === target) {
        logicalOffset += offset;
        break;
      }

      logicalOffset += current.textContent?.length ?? 0;
      current = walker.nextNode();
    }
  } else {
    // If target is an ELEMENT (e.g., contentEl itself), offset is child index
    // Count text characters in all TEXT_NODE children before the offset position
    for (let i = 0; i < offset && i < contentEl.childNodes.length; i++) {
      const child = contentEl.childNodes[i];
      if (!child) continue;

      if (child.nodeType === Node.TEXT_NODE) {
        logicalOffset += child.textContent?.length ?? 0;
      }
      // Skip ELEMENT_NODEs (references) - they contribute 0 to offset
    }
  }

  return { nodeId, offset: logicalOffset };
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
