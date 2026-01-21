/**
 * Keyboard Handler Utilities
 *
 * Shared utilities for keyboard handlers (Enter, Backspace, Tab, Arrows)
 */

import { Editor } from '@tiptap/core';

/**
 * @deprecated
 * This function is deprecated. Use withUISafety wrapper instead.
 *
 * Migration:
 * Before:
 *   export function handleMyKey(editor: Editor): boolean {
 *     if (shouldDeferToUI(editor)) return false;
 *     // ... handler logic
 *   }
 *
 * After:
 *   import { withUISafety } from '../withUISafety';
 *
 *   function handleMyKeyImpl(editor: Editor): boolean {
 *     // ... handler logic (no manual check needed)
 *   }
 *
 *   export const handleMyKey = withUISafety(handleMyKeyImpl, 'handleMyKey');
 *
 * See: packages/editor/plugins/keyboard/ARCHITECTURE.md for details
 *
 * @param editor - TipTap editor instance
 * @returns true if any UI component is active and should handle the key
 */
export function shouldDeferToUI(editor: Editor): boolean {
  // Slash command menu
  if (editor.storage.slashCommands?.isOpen) return true;

  // @ mention autocomplete
  if (editor.storage.atMention?.active) return true;

  // TODO: Add hashtag autocomplete check when implemented
  // TODO: Add other dropdown/menu checks as needed

  return false;
}
