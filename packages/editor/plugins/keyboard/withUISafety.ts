/**
 * UI Safety Wrapper for Keyboard Handlers
 *
 * ARCHITECTURE:
 * - Automatically guards structural handlers against UI intent
 * - Enforces handler contract: true = consumed, false = pass through
 * - Provides dev-mode validation and debugging
 *
 * 🔒 GOLDEN RULE:
 * ALL keyboard handlers in /keyboard/keymaps/ MUST be wrapped with this function.
 * ESLint enforces this at build time.
 */

import type { Editor } from '@tiptap/core';
import { isUIIntentActive, getActiveUIHandler } from './uiIntent';

/**
 * Dev-mode debug storage for keyboard events
 */
interface KeyboardDebugInfo {
  events: Array<{
    handler: string;
    deferred: boolean;
    activeUI: string | null;
    timestamp: number;
  }>;
  violations: Array<{
    handler: string;
    activeUI: string | null;
    timestamp: number;
    reason: string;
  }>;
}

// Global debug storage (dev-mode only)
declare global {
  interface Window {
    __keyboardDebug?: KeyboardDebugInfo;
  }
}

/**
 * Initialize debug storage in dev mode
 */
function initDebugStorage() {
  if (
    typeof window !== 'undefined' &&
    typeof __DEV__ !== 'undefined' &&
    __DEV__
  ) {
    if (!window.__keyboardDebug) {
      window.__keyboardDebug = {
        events: [],
        violations: [],
      };
    }
  }
}

/**
 * Log keyboard event in dev mode
 */
function logKeyboardEvent(
  handler: string,
  deferred: boolean,
  activeUI: string | null
) {
  if (
    typeof window !== 'undefined' &&
    typeof __DEV__ !== 'undefined' &&
    __DEV__
  ) {
    initDebugStorage();
    window.__keyboardDebug?.events.push({
      handler,
      deferred,
      activeUI,
      timestamp: Date.now(),
    });
  }
}

/**
 * Log violation in dev mode
 */
function logViolation(
  handler: string,
  activeUI: string | null,
  reason: string
) {
  if (
    typeof window !== 'undefined' &&
    typeof __DEV__ !== 'undefined' &&
    __DEV__
  ) {
    initDebugStorage();
    window.__keyboardDebug?.violations.push({
      handler,
      activeUI,
      timestamp: Date.now(),
      reason,
    });
    console.error(
      `❌ KEYBOARD HANDLER VIOLATION: ${handler}`,
      `\nReason: ${reason}`,
      activeUI ? `\nActive UI: ${activeUI}` : ''
    );
  }
}

/**
 * Wrap a keyboard handler with UI safety checks
 *
 * This wrapper:
 * 1. Checks if UI intent is active BEFORE calling handler
 * 2. Returns false if UI should handle the key
 * 3. Validates handler contract in dev mode
 * 4. Logs violations for debugging
 *
 * @param handler - The keyboard handler function to wrap
 * @param handlerName - Name of the handler (for logging)
 * @returns Wrapped handler that automatically defers to UI intent
 *
 * @example
 * const handleEnterImpl = (editor: Editor): boolean => {
 *   // Handler logic (no manual UI checks needed)
 *   return true;
 * };
 *
 * export const handleEnter = withUISafety(handleEnterImpl, 'handleEnter');
 */
export function withUISafety<T extends any[]>(
  handler: (editor: Editor, ...args: T) => boolean,
  handlerName?: string
): (editor: Editor, ...args: T) => boolean {
  const name = handlerName || handler.name || 'anonymous';

  return (editor: Editor, ...args: T): boolean => {
    // Check if any UI component is currently active
    const uiActive = isUIIntentActive(editor);
    const activeUI = uiActive ? getActiveUIHandler(editor) : null;

    // If UI is active, defer to it
    if (uiActive) {
      logKeyboardEvent(name, true, activeUI);
      return false; // Pass through to UI handler
    }

    // Log that we're executing the handler
    logKeyboardEvent(name, false, null);

    // Execute the wrapped handler
    const result = handler(editor, ...args);

    // Dev-mode validation: ensure contract is followed
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // If handler returned true while UI was active (race condition check)
      if (result && isUIIntentActive(editor)) {
        logViolation(
          name,
          getActiveUIHandler(editor),
          'Handler consumed key while UI intent was active (possible race condition)'
        );
      }

      // Note: We can't reliably detect "returned true without dispatching"
      // because PM dispatches happen asynchronously. This would require
      // wrapping the editor.view.dispatch function, which is too invasive.
      // The ESLint rule and manual code review catch this instead.
    }

    return result;
  };
}

/**
 * Type guard to check if a function is wrapped with withUISafety
 * (For use in tests or advanced debugging)
 *
 * @param fn - Function to check
 * @returns true if function appears to be wrapped
 */
export function isWrappedWithUISafety(fn: (...args: any[]) => any): boolean {
  // This is heuristic-based since we can't perfectly detect wrapping
  // The ESLint rule is the real enforcement mechanism
  return fn.toString().includes('isUIIntentActive');
}
