/**
 * 🔒 SELECTION INTENT — Read-Only Selection Handling
 *
 * ABSOLUTE PRINCIPLE:
 * selectionchange is HOSTILE. It lies. It fires at wrong times.
 * This module makes it read-only - captures intent, never mutates.
 *
 * All cursor updates go through CommitPipeline, never direct.
 *
 * ENFORCEMENT:
 * - selectionchange captures intent → queues operation → pipeline executes
 * - Cannot mutate state directly
 * - Cannot call setEditorState
 * - Cannot update cursor synchronously
 */

import type { Node, CursorPosition } from '../editor/engine';
import { performEditorOperation } from './CommitPipeline';
// ✂️ PHASE 2.5: TypingBuffer import DELETED
import { isPipelineLocked } from './CommitPipeline';

/**
 * Selection intent (captured, not applied)
 */
interface SelectionIntent {
  type: 'cursor-move';
  nodeId: string;
  segmentIndex: number;
  offset: number;
  timestamp: number;
}

/**
 * Pending intent (null if none)
 */
let pendingIntent: SelectionIntent | null = null;

/**
 * Last applied intent timestamp (prevents duplicates)
 */
let lastAppliedTimestamp = 0;

/**
 * Capture selection intent (does NOT mutate)
 *
 * Called by selectionchange handler.
 * Queues intent for processing by pipeline.
 */
export function captureSelectionIntent(
  nodeId: string,
  segmentIndex: number,
  offset: number
): void {
  // ✂️ PHASE 2.5: isTyping() guard DELETED
  // With MutationObserver, selection changes during typing are natural
  // DOM is authoritative, no special handling needed

  // Guard: Skip if pipeline locked (structural op in progress)
  if (isPipelineLocked()) {
    if (__DEV__) {

    }
    return;
  }

  // Queue intent
  pendingIntent = {
    type: 'cursor-move',
    nodeId,
    segmentIndex,
    offset,
    timestamp: Date.now(),
  };

  if (__DEV__) {

  }

  // Schedule processing (async, after current event loop)
  scheduleIntentProcessing();
}

/**
 * Schedule intent processing (debounced)
 */
let processingScheduled = false;

function scheduleIntentProcessing(): void {
  if (processingScheduled) return;
  processingScheduled = true;

  // Use microtask to process after current event
  Promise.resolve().then(() => {
    processingScheduled = false;
    processIntent();
  });
}

/**
 * Process pending intent (through pipeline)
 *
 * This is the ONLY place where selection intent becomes a state change.
 * Goes through CommitPipeline, not direct mutation.
 */
function processIntent(): void {
  if (!pendingIntent) return;

  const intent = pendingIntent;
  pendingIntent = null;

  // Skip if already applied (prevent duplicate)
  if (intent.timestamp <= lastAppliedTimestamp) {
    if (__DEV__) {

    }
    return;
  }

  // ✂️ PHASE 2.5: isTyping() guard DELETED
  // Guard: Re-check conditions (may have changed)
  if (isPipelineLocked()) {
    if (__DEV__) {

    }
    return;
  }

  // Execute through pipeline
  performEditorOperation({
    type: 'CursorMove',
    execute: (nodes, currentCursor) => {
      // Validate node exists
      const targetNode = nodes.find((n) => n.id === intent.nodeId);
      if (!targetNode) {
        if (__DEV__) {

        }
        // Return unchanged
        return { nodes, cursor: currentCursor };
      }

      // Build new cursor
      const newCursor: CursorPosition = {
        nodeId: intent.nodeId,
        segmentIndex: intent.segmentIndex,
        offset: intent.offset,
      };

      if (__DEV__) {

      }

      lastAppliedTimestamp = intent.timestamp;
      return { nodes, cursor: newCursor };
    },
  });
}

/**
 * Clear pending intent (e.g., on blur, unmount)
 */
export function clearSelectionIntent(): void {
  pendingIntent = null;
  processingScheduled = false;
}

/**
 * Check if intent is pending
 */
export function hasSelectionIntent(): boolean {
  return pendingIntent !== null;
}

// Global declaration for __DEV__
declare const __DEV__: boolean;
