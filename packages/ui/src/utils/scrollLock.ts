/**
 * Scroll Lock Utility
 *
 * Reference-counted scroll locking for overlays and floating UI.
 * Multiple components can acquire locks, and scroll is only restored
 * when all locks are released.
 *
 * Usage:
 *   acquireScrollLock()  // locks scroll (if first lock)
 *   releaseScrollLock()  // unlocks scroll (if last lock released)
 *
 * Features:
 * - Reference counting (handles nested/multiple overlays)
 * - Preserves scroll position
 * - Tries .scroll-wrapper first (AppLayout), falls back to body
 * - No React dependencies (pure utility)
 */

let lockCount = 0;
let cleanup: (() => void) | null = null;

/**
 * Acquire a scroll lock.
 * If this is the first lock, scrolling is blocked.
 * Subsequent calls increment the counter without re-locking.
 */
export function acquireScrollLock(): void {
  lockCount++;

  // Already locked by another overlay - just increment counter
  if (lockCount > 1) return;

  // Find the actual scrolling container (.scroll-wrapper in AppLayout)
  const scrollContainer = document.querySelector(
    '.scroll-wrapper'
  ) as HTMLElement | null;

  if (scrollContainer) {
    // Lock the scroll container
    const scrollY = scrollContainer.scrollTop;
    const originalOverflow = scrollContainer.style.overflow;

    scrollContainer.style.overflow = 'hidden';

    cleanup = () => {
      scrollContainer.style.overflow = originalOverflow;
      scrollContainer.scrollTop = scrollY;
    };
  } else {
    // Fallback: Lock body scrolling (for non-desktop apps or other contexts)
    const scrollY = window.scrollY;
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    cleanup = () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.width = originalWidth;
      window.scrollTo(0, scrollY);
    };
  }
}

/**
 * Release a scroll lock.
 * If this is the last lock, scrolling is restored.
 * Subsequent calls decrement the counter without unlocking.
 */
export function releaseScrollLock(): void {
  lockCount--;

  // Still have active locks - don't unlock yet
  if (lockCount > 0) return;

  // Last lock released - restore scrolling
  cleanup?.();
  cleanup = null;
  lockCount = 0; // Reset to ensure clean state
}

/**
 * Get the current lock count (for debugging/testing)
 */
export function getScrollLockCount(): number {
  return lockCount;
}

/**
 * Force reset all locks (use only for error recovery or tests)
 */
export function resetScrollLock(): void {
  if (lockCount > 0) {
    cleanup?.();
    cleanup = null;
    lockCount = 0;
  }
}
