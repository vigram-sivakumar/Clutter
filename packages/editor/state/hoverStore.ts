/**
 * Hover Store - Block hover state (semantic, not pixel-based)
 *
 * RULES:
 * - Block-scoped hover only
 * - No mousemove
 * - No geometry here
 * - Emitted from block gutters only
 */

let hoveredBlockId: string | null = null;
let isHoveringChrome = false; // Hover bridge guard
const listeners = new Set<() => void>();

export function setHoveredBlock(id: string | null) {
  console.log('[HoverStore] setHoveredBlock:', id);
  hoveredBlockId = id;
  console.log('[HoverStore] Notifying', listeners.size, 'listeners');
  listeners.forEach((l) => l());
}

export function setHoveringChrome(hovering: boolean) {
  console.log('[HoverStore] setHoveringChrome:', hovering);
  isHoveringChrome = hovering;
  // Notify listeners so chrome can stay visible when mouse moves from block to chrome
  listeners.forEach((l) => l());
}

export function getHoveredBlock() {
  // Return block ID if EITHER block is hovered OR chrome is hovered
  if (isHoveringChrome && hoveredBlockId) return hoveredBlockId;
  return hoveredBlockId;
}

export function getHoveringChrome() {
  return isHoveringChrome;
}

export function subscribeHover(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
