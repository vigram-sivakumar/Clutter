/**
 * Keyboard Handler Utilities
 *
 * Shared utilities for keyboard handlers (Enter, Backspace, Tab, Arrows)
 */

import { Editor } from '@tiptap/core';

/**
 * Check if UI handlers (menus, dropdowns, autocomplete) are active
 *
 * 🔒 GOLDEN RULE: UI intent ALWAYS wins over structural intent
 * When UI is active, structural handlers must defer (return false)
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
