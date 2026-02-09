/**
 * DOMObserver - MutationObserver-based DOM change tracking
 *
 * CRITICAL ARCHITECTURAL INVARIANTS:
 *
 * 1. MutationObserver tracks CONTENT mutations only (Fix #1)
 *    - Text changes
 *    - Element insertions/removals
 *    - Attribute changes
 *
 * 2. MutationObserver does NOT track (Fix #1):
 *    - Selection/cursor changes
 *    - Caret movement
 *    - Some IME composition states (Safari)
 *
 * 3. Cursor position MUST be read synchronously from window.getSelection()
 *    at commit boundaries. NEVER infer cursor from mutations. (Fix #1)
 *
 * 4. Pending mutations are for diagnostics ONLY (Fix #2)
 *    They MUST NOT be used to infer editor state.
 *    All authoritative state is extracted from DOM at commit boundaries.
 *
 * 5. This observer is PASSIVE, not REACTIVE
 *    - It logs mutations
 *    - It does NOT automatically update state
 *    - State updates happen explicitly at commit boundaries
 *
 * Architecture: Inspired by Tana's approach (see TANA-COMPLETE-LEARNINGS.md)
 * Contract: All usage must follow COMMIT-BOUNDARY-CONTRACT.md
 */

import type { Segment } from '../engine/NodeKernel';

export interface DOMObserverConfig {
  /**
   * The contentEditable element to observe
   */
  element: HTMLElement;

  /**
   * Optional callback when mutations are batched
   *
   * WARNING: This is for diagnostics only.
   * Do not use this to update editor state.
   * State extraction happens at commit boundaries only.
   */
  onMutationsBatched?: (mutations: MutationRecord[]) => void;
}

/**
 * DOMObserver - Passive mutation observer for contentEditable elements
 *
 * USAGE PATTERN:
 *
 * ```typescript
 * // Setup (once per node)
 * const observer = new DOMObserver({
 *   element: contentEditableElement,
 *   onMutationsBatched: (mutations) => {
 *     console.log('[Diagnostic]', mutations.length, 'mutations');
 *   }
 * });
 * observer.start();
 *
 * // At commit boundary (Enter, Backspace, Blur, etc.)
 * observer.stop(); // CRITICAL: Stop before reading DOM
 * const segments = extractSegmentsFromDOM(element);
 * const cursor = window.getSelection(); // NEVER infer from mutations
 * // ... perform model update ...
 * observer.clearPendingMutations(); // CRITICAL: Clear diagnostics
 * requestAnimationFrame(() => observer.start()); // Restart after React render
 *
 * // On unmount or node deletion (Fix #5)
 * observer.destroy(); // CRITICAL: Prevent memory leak
 * ```
 */
export class DOMObserver {
  private observer: MutationObserver;
  private element: HTMLElement;
  private isObserving = false;

  /**
   * Pending mutations - FOR DIAGNOSTICS ONLY (Fix #2)
   *
   * CRITICAL: These MUST NOT be used to infer editor state.
   *
   * Valid uses:
   * - Debugging (log what changed)
   * - Performance monitoring (mutation count)
   * - Test assertions (verify mutations fired)
   *
   * INVALID uses:
   * - Computing deltas
   * - Deriving cursor position (use window.getSelection() instead)
   * - Incremental state updates
   * - Any logic that affects model state
   *
   * All authoritative state is extracted from DOM at commit boundaries.
   * These mutations are a diagnostic log, not a data source.
   */
  private pendingMutations: MutationRecord[] = [];

  private onMutationsBatched?: (mutations: MutationRecord[]) => void;

  constructor(config: DOMObserverConfig) {
    this.element = config.element;
    this.onMutationsBatched = config.onMutationsBatched;

    this.observer = new MutationObserver((mutations) => {
      // Store for diagnostics (Fix #2: explicitly non-authoritative)
      this.pendingMutations.push(...mutations);

      // Optional callback for logging/debugging
      if (this.onMutationsBatched) {
        this.onMutationsBatched(mutations);
      }
    });
  }

  /**
   * Start observing DOM mutations
   *
   * Call this:
   * - After component mount
   * - After React render (inside requestAnimationFrame)
   *
   * Do NOT call this:
   * - During structural operations
   * - Before React render completes
   */
  start() {
    if (this.isObserving) {
      console.warn('[DOMObserver] Already observing, ignoring start()');
      return;
    }

    this.observer.observe(this.element, {
      // Track content mutations
      childList: true, // Node additions/removals
      characterData: true, // Text content changes
      subtree: true, // Watch all descendants

      // Do NOT track attributes (we don't care about class/style changes)
      attributes: false,
    });

    this.isObserving = true;

    if (__DEV__) {
      console.log('[DOMObserver] Started observing', {
        element: this.element.getAttribute('data-node-id'),
      });
    }
  }

  /**
   * Stop observing DOM mutations
   *
   * Call this:
   * - BEFORE extracting segments at commit boundaries (CRITICAL)
   * - Before component unmount
   * - Before destroying observer
   *
   * Do NOT call this:
   * - During normal typing (observer should run)
   */
  stop() {
    if (!this.isObserving) {
      // Not an error - may be called defensively
      if (__DEV__) {
        console.log('[DOMObserver] Not observing, ignoring stop()');
      }
      return;
    }

    this.observer.disconnect();
    this.isObserving = false;

    if (__DEV__) {
      console.log('[DOMObserver] Stopped observing', {
        element: this.element.getAttribute('data-node-id'),
        pendingMutations: this.pendingMutations.length,
      });
    }
  }

  /**
   * Check if observer is currently observing
   *
   * Useful for:
   * - Assertions (should NOT be observing during commit)
   * - Debugging (check observer state)
   */
  isRunning(): boolean {
    return this.isObserving;
  }

  /**
   * Get pending mutations for diagnostics
   *
   * WARNING: Do not use these for state computation. (Fix #2)
   * This is for logging/debugging only.
   *
   * Return value is a shallow copy to prevent external mutation.
   */
  getPendingMutations(): MutationRecord[] {
    return [...this.pendingMutations];
  }

  /**
   * Clear pending mutations
   *
   * MUST be called after every commit boundary to prevent stale diagnostic data.
   * (Fix #2)
   *
   * Call this:
   * - After `commit()` in all commit boundaries
   * - Before restarting observer
   *
   * Failure to call this will:
   * - Cause memory leaks (mutations accumulate)
   * - Produce confusing diagnostic logs
   */
  clearPendingMutations() {
    if (__DEV__ && this.pendingMutations.length > 0) {
      console.log(
        '[DOMObserver] Clearing',
        this.pendingMutations.length,
        'mutations'
      );
    }
    this.pendingMutations = [];
  }

  /**
   * Destroy observer (Fix #5: Lifecycle management)
   *
   * MUST be called when:
   * - Node is deleted (Backspace merge, general deletion)
   * - Component unmounts
   * - Editor is destroyed
   *
   * Failure to call this will:
   * - Cause memory leaks (observer still attached to deleted node)
   * - Cause phantom mutations (observer fires on garbage-collected nodes)
   *
   * This is CRITICAL for Fix #5.
   */
  destroy() {
    this.stop();
    this.pendingMutations = [];

    if (__DEV__) {
      console.log('[DOMObserver] Destroyed', {
        element: this.element.getAttribute('data-node-id'),
      });
    }

    // Clear references for garbage collection
    // @ts-expect-error - Intentionally clearing for GC
    this.observer = null;
    // @ts-expect-error - Intentionally clearing for GC
    this.element = null;
    this.onMutationsBatched = undefined;
  }
}

/**
 * Extract segments from a contentEditable DOM element
 *
 * This is the ONLY function that converts DOM to segments.
 * It replaces `handleSegmentedInput()` from the old architecture.
 *
 * USAGE:
 * Call this ONLY at commit boundaries (Fix #1):
 * - Enter key
 * - Backspace merge
 * - Blur
 * - Arrow keys (node change)
 * - Debounce
 *
 * Do NOT call this:
 * - During normal typing
 * - On input events
 * - While observer is running (stop it first)
 *
 * CURSOR POSITION (Fix #1):
 * This function does NOT return cursor position.
 * You MUST read cursor separately using window.getSelection().
 *
 * @param element - The contentEditable element to extract from
 * @returns Array of segments (text + inline elements)
 */
export function extractSegmentsFromDOM(element: HTMLElement): Segment[] {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🚨 SECURITY: Detect nested contenteditable (corruption vector)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // If user pastes content with nested contenteditable elements, we MUST NOT
  // extract from the nested editable's descendants. That would corrupt our
  // segment model by mixing content from different logical nodes.
  //
  // Instead: Refuse extraction and return empty (or cached segments if available).
  // The nested editable will be rendered as unknown element → text fallback.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const nestedEditable = element.querySelector('[contenteditable="true"]');

  if (nestedEditable && nestedEditable !== element) {
    // ✅ EXCEPTION: Ignore caret-anchor spans (they're part of our architecture)
    // Caret-anchors are zero-width spans for cursor placement around inline elements
    // They have contenteditable="true" but are NOT malicious nested editables
    const isSafeCaretAnchor = (
      nestedEditable as HTMLElement
    ).classList?.contains('caret-anchor');

    if (!isSafeCaretAnchor) {
      console.error(
        '🚨 SECURITY VIOLATION: Nested contenteditable detected!\n' +
          'Refusing extraction to prevent data corruption.\n' +
          'Element:',
        element,
        '\nNested:',
        nestedEditable
      );

      // Return empty segments (node will appear empty, which is safer than corruption)
      // Alternative: Return cached segments if we stored them before
      // For now: Empty is safest (forces user to re-enter content)
      return [];
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SAFE: No nested editables detected, proceed with extraction
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const segments: Segment[] = [];

  // Walk direct children only (not recursive - structure is flat)
  for (const child of Array.from(element.childNodes)) {
    // Text nodes
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || '';
      if (text) {
        // 🔒 UNBREAKABLE: Do NOT merge consecutive text segments
        // Previous "optimization" broke cursor positions after merge operations
        // Each DOM text node must map to exactly one segment (1:1 mapping)
        // This preserves cursor segmentIndex across extraction cycles
        segments.push({ type: 'text', text });
      }
      continue;
    }

    // Element nodes
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;

      // Inline elements (@refs, #tags)
      if (el.classList.contains('inline-element')) {
        const inlineId = el.getAttribute('data-inline-id');
        if (!inlineId) {
          console.warn(
            '[extractSegmentsFromDOM] Inline element missing data-inline-id',
            el
          );
          continue;
        }

        // Determine kind (ref vs tag)
        let kind: 'ref' | 'tag' = 'ref';
        if (el.classList.contains('inline-ref')) kind = 'ref';
        else if (el.classList.contains('inline-tag')) kind = 'tag';

        segments.push({
          type: 'inline',
          kind: kind as 'ref', // Cast - tags treated as refs for now
          id: inlineId,
          payload: { type: 'reference', targetId: inlineId },
        });
        continue;
      }

      // Caret anchors (zero-width spans for cursor placement)
      if (el.classList.contains('caret-anchor')) {
        // 🔒 UNBREAKABLE FIX (Bug #3): Extract text from inside caret-anchor
        // Browser may place typed text inside contenteditable caret-anchors
        // We must capture this text before skipping the anchor itself
        const text = el.textContent || '';
        if (text) {
          // 🔒 CONSISTENCY: Match text node behavior - each text source = separate segment
          // Do NOT merge to preserve cursor positions
          segments.push({ type: 'text', text });
        }
        // Skip the caret-anchor element itself (it's a rendering artifact)
        continue;
      }

      // Unknown elements - extract text content as fallback
      const text = el.textContent || '';
      if (text) {
        console.warn(
          '[extractSegmentsFromDOM] Unknown element, extracting text',
          el
        );
        segments.push({ type: 'text', text });
      }
    }
  }

  if (__DEV__) {
    console.log('[extractSegmentsFromDOM]', {
      nodeId: element.getAttribute('data-node-id'),
      segmentCount: segments.length,
      segments,
    });
  }

  return segments;
}

/**
 * Development-only assertions for observer state
 *
 * These help catch contract violations early.
 */
export function assertObserverStopped(
  observer: DOMObserver | undefined,
  operation: string
) {
  if (__DEV__ && observer && observer.isRunning()) {
    throw new Error(
      `❌ OBSERVER CONTRACT VIOLATION: Observer still running during ${operation}!\n` +
        `CRITICAL: You MUST stop the observer before ${operation}.\n` +
        `See COMMIT-BOUNDARY-CONTRACT.md Step 2.`
    );
  }
}

export function assertObserverStarted(
  observer: DOMObserver | undefined,
  phase: string
) {
  if (__DEV__ && observer && !observer.isRunning()) {
    console.warn(
      `⚠️ Observer not running during ${phase}. This may be intentional (e.g., during blur) or a bug.`
    );
  }
}

/**
 * Helper to create and manage observer lifecycle
 *
 * This is a convenience function for common setup/teardown patterns.
 *
 * @returns Observer + cleanup function
 */
export function createObserver(config: DOMObserverConfig): {
  observer: DOMObserver;
  cleanup: () => void;
} {
  const observer = new DOMObserver(config);

  const cleanup = () => {
    observer.stop();
    observer.destroy();
  };

  return { observer, cleanup };
}
