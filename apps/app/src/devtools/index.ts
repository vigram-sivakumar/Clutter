/**
 * Clutter Developer Tools Platform
 *
 * Optional set of development-only tools exposed via window.__clutter_devtools.
 * Activated only when VITE_DEVTOOLS=true environment variable is set.
 *
 * This is wired in Application.ts's Composition Root and is entirely optional.
 * Production builds never include this code or expose the devtools interface.
 *
 * Available at: window.__clutter_devtools
 *
 * Phases:
 * - Phase 1 (current): Workspace reset for test isolation
 * - Phase 2: Vault clearing + state inspection API
 * - Phase 3: Browser DevTools extension
 */

import type { Application } from '../core/application/Application';
import { resetWorkspace } from './workspace/reset';

interface ClutterDevTools {
  /**
   * Reset workspace state for test isolation.
   *
   * Phase 1: Clears active navigation, closes open pages, clears history.
   * Phase 2: Will also clear vault content (write files).
   */
  workspace: {
    /**
     * Reset navigation and page state (active page, history, etc.)
     * Safe to call multiple times; idempotent.
     */
    reset: () => void;

    /**
     * Clear vault directory (delete all .md files).
     * Phase 2 feature — not yet implemented.
     * Workaround: Use browser console to load a fresh vault directory per test.
     */
    clear?: () => Promise<void>;
  };

  /**
   * Future: Read-only vault inspection
   */
  vault?: {
    // TODO (Phase 2): list pages, folders, inspect page content, etc.
  };

  /**
   * Future: Document editing state inspection
   */
  document?: {
    // TODO (Phase 2): inspect active document state, undo history, etc.
  };
}

/**
 * Attach devtools to the window object (only in dev mode).
 *
 * Called from Application.ts's Composition Root if VITE_DEVTOOLS is set.
 * Never called in production.
 */
export function attachDevTools(app: Application): void {
  // Only expose in development
  if (process.env.NODE_ENV !== 'development' || !process.env.VITE_DEVTOOLS) {
    return;
  }

  const devtools: ClutterDevTools = {
    workspace: {
      reset: () => {
        resetWorkspace(app.workspace);
      },
    },
  };

  // Expose on window for browser console access
  Object.defineProperty(window, '__clutter_devtools', {
    value: devtools,
    writable: false,
    configurable: false,
  });

  console.log('✨ Clutter DevTools available at window.__clutter_devtools');
}

export type { ClutterDevTools };
