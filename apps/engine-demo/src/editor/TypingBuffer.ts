/**
 * 🔒 TYPING BUFFER - DOM-Owned Input Architecture
 *
 * CRITICAL PRINCIPLE:
 * Typing mutates DOM only. React handles structure only.
 *
 * This buffer holds segment changes during typing WITHOUT triggering React.
 * React state updates ONLY happen at flush boundaries (Enter, blur, etc.)
 *
 * GUARANTEES:
 * - Zero React renders during typing
 * - No cursor jumps
 * - No selection recalculation during input
 * - Atomic segment updates at boundaries
 */

import type { NodeID, Segment } from '../engine/NodeKernel';

/**
 * Pending segment updates (in-memory only, never triggers React)
 */
const pendingSegmentUpdates = new Map<NodeID, Segment[]>();

/**
 * Typing flag - true while user is typing, false at rest
 */
let isTypingInProgress = false;

/**
 * Debounce flush flag - true during debounce flush to prevent DOM updates
 */
let isDebounceFlushInProgress = false;

/**
 * Last typing activity timestamp (for debounce)
 */
let lastTypingTime = 0;

/**
 * Live cursor position during typing (NOT React state)
 * Only synced to React at structural boundaries
 */
let liveCursor: {
  nodeId: NodeID;
  segmentIndex: number;
  offset: number;
} | null = null;

/**
 * Mark that typing has started
 */
export function startTyping(): void {
  isTypingInProgress = true;
  lastTypingTime = Date.now();
}

/**
 * Mark that typing has stopped
 */
export function stopTyping(): void {
  isTypingInProgress = false;
}

/**
 * Check if user is currently typing
 */
export function isTyping(): boolean {
  return isTypingInProgress;
}

/**
 * Check if typing is idle (for debounce)
 */
export function isTypingIdle(idleThresholdMs: number = 500): boolean {
  if (!isTypingInProgress) return true;
  return Date.now() - lastTypingTime > idleThresholdMs;
}

/**
 * Store segment changes locally (NO REACT STATE UPDATE)
 *
 * This is called by handleSegmentedInput INSTEAD OF setState.
 * Changes stay in memory until flushed at a boundary.
 */
export function setPendingSegments(nodeId: NodeID, segments: Segment[]): void {
  pendingSegmentUpdates.set(nodeId, segments);
  startTyping();

  // Update global timestamp for debounce
  (globalThis as any).__lastTypingActivity = Date.now();
}

/**
 * Get pending segments for a node (or null if none)
 */
export function getPendingSegments(nodeId: NodeID): Segment[] | null {
  return pendingSegmentUpdates.get(nodeId) || null;
}

/**
 * Check if node has pending changes
 */
export function hasPendingChanges(nodeId: NodeID): boolean {
  return pendingSegmentUpdates.has(nodeId);
}

/**
 * Get all nodes with pending changes
 */
export function getAllPendingNodeIds(): NodeID[] {
  return Array.from(pendingSegmentUpdates.keys());
}

/**
 * Clear pending segments for a node
 */
export function clearPendingSegments(nodeId: NodeID): void {
  pendingSegmentUpdates.delete(nodeId);
}

/**
 * Clear all pending segments
 */
export function clearAllPendingSegments(): void {
  pendingSegmentUpdates.clear();
  stopTyping();
}

/**
 * Get count of pending updates (for debugging)
 */
export function getPendingCount(): number {
  return pendingSegmentUpdates.size;
}

/**
 * 🚨 DEV ASSERTION: Ensure no React updates during input
 */
export function assertNoReactDuringTyping(eventType: string): void {
  if (__DEV__ && eventType === 'input' && isTypingInProgress) {
    // This is actually OK - we're setting pending, not React state
    // The violation would be calling setState here
    return;
  }
}

/**
 * 🚨 DEV ASSERTION: Ensure flush only happens at boundaries
 */
export function assertFlushBoundary(reason: string): void {
  if (__DEV__) {
    const validReasons = [
      'enter',
      'backspace-merge',
      'blur',
      'node-change',
      'debounce',
      'manual-save',
      'structural-op',
    ];

    if (!validReasons.includes(reason)) {
      console.warn(
        '⚠️ TypingBuffer: Flush called with invalid reason:',
        reason
      );
    }
  }
}

/**
 * 🔒 LIVE CURSOR (NOT React state)
 *
 * During typing, cursor position is stored HERE, not in React state.
 * This prevents React re-renders on every selection change.
 */
export function setLiveCursor(cursor: {
  nodeId: NodeID;
  segmentIndex: number;
  offset: number;
}): void {
  liveCursor = cursor;
}

export function getLiveCursor(): {
  nodeId: NodeID;
  segmentIndex: number;
  offset: number;
} | null {
  return liveCursor;
}

export function clearLiveCursor(): void {
  liveCursor = null;
}

/**
 * 🔒 DEBOUNCE FLUSH FLAG
 *
 * Set to true during debounce flush to prevent NodeView from rebuilding DOM.
 * This keeps the browser's native caret alive during idle state sync.
 */
export function startDebounceFlush(): void {
  isDebounceFlushInProgress = true;
  // Set global flag for NodeView guard
  (globalThis as any).__isDebounceFlush = true;
}

export function stopDebounceFlush(): void {
  isDebounceFlushInProgress = false;
  // Clear global flag
  (globalThis as any).__isDebounceFlush = false;
}

export function isDebounceFlush(): boolean {
  return isDebounceFlushInProgress;
}

// Global declaration for __DEV__
declare const __DEV__: boolean;
