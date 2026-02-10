/**
 * 🔒 KEYBOARD OWNERSHIP LOCK
 * 
 * SINGLE SOURCE OF TRUTH for keyboard event ownership.
 * 
 * RULES:
 * - Browser owns: Navigation and deletion that works natively
 * - Editor owns: Structural operations that need coordination
 * 
 * NO per-handler discretion allowed.
 * NO heuristics.
 * NO DOM inspection to decide ownership.
 */

export const KeyboardOwnership = {
  /**
   * Browser-owned keys (NO EDITOR INTERVENTION)
   * 
   * These work correctly with contenteditable by default.
   * Editor must NOT intercept these.
   */
  Browser: [
    'ArrowLeft',
    'ArrowRight', 
    'Delete',           // Forward delete within text
    // Standard text editing
    'Home',
    'End',
    'PageUp',
    'PageDown',
    // Clipboard (browser handles)
    'c',  // Ctrl+C / Cmd+C
    'x',  // Ctrl+X / Cmd+X
    'v',  // Ctrl+V / Cmd+V (Note: we observe result, don't intercept)
    'a',  // Ctrl+A / Cmd+A (select all)
    'z',  // Handled by our undo system, but key event propagates
    'y',  // Handled by our redo system, but key event propagates
  ] as const,

  /**
   * Editor-owned keys (EDITOR INTERVENTION REQUIRED)
   * 
   * These need coordination across nodes or special semantics.
   * Editor MUST intercept and handle these.
   */
  Editor: [
    'Enter',            // Split node (MOVE-TAIL semantics)
    'Backspace',        // Merge nodes at boundary
    'Tab',              // Indent/outdent
    'ArrowUp',          // Navigate to previous node
    'ArrowDown',        // Navigate to next node
  ] as const,
} as const;

/**
 * Check if key should be handled by browser
 */
export function isBrowserOwned(key: string): boolean {
  return (KeyboardOwnership.Browser as readonly string[]).includes(key);
}

/**
 * Check if key should be handled by editor
 */
export function isEditorOwned(key: string): boolean {
  return (KeyboardOwnership.Editor as readonly string[]).includes(key);
}

/**
 * Guard: Enforce ownership boundaries in event handlers
 * 
 * Usage in NodeEditor:
 * ```ts
 * function handleKeyDown(e: KeyboardEvent) {
 *   assertKeyboardOwnership(e.key, 'editor');
 *   // ... handle the event
 * }
 * ```
 */
export function assertKeyboardOwnership(
  key: string,
  expectedOwner: 'browser' | 'editor'
): void {
  const actualOwner = isBrowserOwned(key) ? 'browser' : isEditorOwned(key) ? 'editor' : 'unknown';

  if (actualOwner !== expectedOwner) {
    throw new Error(
      `[KEYBOARD OWNERSHIP] Key "${key}" is owned by ${actualOwner}, not ${expectedOwner}`
    );
  }
}

/**
 * Get the correct handler zone for a key
 */
export function getKeyOwner(key: string): 'browser' | 'editor' | 'unknown' {
  if (isBrowserOwned(key)) return 'browser';
  if (isEditorOwned(key)) return 'editor';
  return 'unknown';
}
