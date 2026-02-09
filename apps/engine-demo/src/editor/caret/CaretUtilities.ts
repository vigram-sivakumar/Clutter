/**
 * CaretUtilities.ts
 *
 * Type-safe utilities for requestAnimationFrame and caret placement.
 *
 * CRITICAL: This module eliminates the RAF timestamp bug class by ensuring
 * callbacks are never passed the DOMHighResTimeStamp parameter.
 */

/**
 * RAF callback signature - NEVER accepts timestamp parameter
 * This prevents the bug where RAF's timestamp gets interpreted as a function parameter
 */
export type RAFCallback = () => void;

/**
 * Token for cancelling a scheduled RAF callback
 */
export interface CancelToken {
  cancel: () => void;
}

/**
 * Type-safe wrapper for requestAnimationFrame
 *
 * GUARANTEES:
 * - Callback is never passed the timestamp parameter
 * - Callback can be cancelled via returned token
 * - Cancelled callbacks will never execute
 *
 * @param callback - Function to execute on next frame (receives no arguments)
 * @returns CancelToken for cancelling the callback
 *
 * @example
 * ```typescript
 * const token = scheduleRAF(() => {
 *   console.log('Next frame!');
 * });
 *
 * // Later, if needed:
 * token.cancel();
 * ```
 */
export function scheduleRAF(callback: RAFCallback): CancelToken {
  let cancelled = false;

  // Wrapper ensures callback receives no arguments
  const wrappedCallback = (_timestamp: DOMHighResTimeStamp) => {
    if (!cancelled) {
      callback(); // ✅ No args passed to user callback
    }
  };

  const rafId = requestAnimationFrame(wrappedCallback);

  return {
    cancel: () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    },
  };
}

/**
 * Schedule multiple RAF callbacks in sequence
 *
 * @param callbacks - Array of callbacks to execute in order, one per frame
 * @returns CancelToken that cancels all remaining callbacks
 *
 * @example
 * ```typescript
 * const token = scheduleRAFSequence([
 *   () => console.log('Frame 1'),
 *   () => console.log('Frame 2'),
 *   () => console.log('Frame 3'),
 * ]);
 * ```
 */
export function scheduleRAFSequence(callbacks: RAFCallback[]): CancelToken {
  let cancelled = false;
  let currentToken: CancelToken | null = null;

  const executeNext = (index: number) => {
    if (cancelled || index >= callbacks.length) return;

    const callback = callbacks[index];
    if (!callback) return;

    currentToken = scheduleRAF(() => {
      callback();
      executeNext(index + 1);
    });
  };

  executeNext(0);

  return {
    cancel: () => {
      cancelled = true;
      currentToken?.cancel();
    },
  };
}
