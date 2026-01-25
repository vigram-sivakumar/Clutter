/**
 * UI Intent Registry
 *
 * ARCHITECTURE:
 * - All UI handlers (menus, dropdowns, autocomplete) register here
 * - Structural handlers check this FIRST via withUISafety wrapper
 * - Single source of truth for all UI state
 * - Type-safe, centralized, self-documenting
 *
 * 🔒 GOLDEN RULE:
 * No keyboard handler may inspect editor.storage.* directly.
 * They must use isUIIntentActive() or be wrapped with withUISafety().
 */

import type { Editor } from '@tiptap/core';

/**
 * All possible UI intent types in the editor
 * Add new UI components here when implemented
 */
export type UIIntentType =
  | 'slashCommands'
  | 'atMention'
  | 'hashtagAutocomplete'
  | 'commandPalette'
  | 'datePicker'
  | 'colorPicker'
  | 'emojiPicker';

/**
 * Configuration for a UI handler
 */
interface UIHandlerConfig {
  /** Unique identifier for this UI component */
  name: UIIntentType;
  /** Function to check if this UI component is currently active */
  isActive: (editor: Editor) => boolean;
  /** Priority level (higher = earlier check, for future stacking) */
  priority: number;
}

/**
 * Central registry of all UI handlers
 *
 * To add a new UI component:
 * 1. Add type to UIIntentType
 * 2. Add config to this array
 * 3. That's it - all structural handlers automatically defer
 */
const UI_HANDLERS: readonly UIHandlerConfig[] = [
  {
    name: 'slashCommands',
    isActive: (editor) => editor.storage.slashCommands?.isOpen ?? false,
    priority: 10000,
  },
  {
    name: 'atMention',
    isActive: (editor) => editor.storage.atMention?.active ?? false,
    priority: 10000,
  },
  // Future UI components go here
] as const;

/**
 * Check if ANY UI handler is currently active
 *
 * This is the canonical function for determining if structural
 * keyboard handlers should defer to UI handlers.
 *
 * @param editor - TipTap editor instance
 * @returns true if any UI component is active and should handle the key
 *
 * @example
 * if (isUIIntentActive(editor)) {
 *   return false; // Let UI handle it
 * }
 */
export function isUIIntentActive(editor: Editor): boolean {
  return UI_HANDLERS.some((handler) => handler.isActive(editor));
}

/**
 * Get the name of the currently active UI handler (for debugging)
 *
 * @param editor - TipTap editor instance
 * @returns Name of active UI handler, or null if none active
 *
 * @example
 * const activeUI = getActiveUIHandler(editor);
 * console.log(`Active UI: ${activeUI}`); // "slashCommands" or null
 */
export function getActiveUIHandler(editor: Editor): UIIntentType | null {
  const active = UI_HANDLERS.find((handler) => handler.isActive(editor));
  return active?.name ?? null;
}

/**
 * Get all registered UI handler names (for debugging/testing)
 *
 * @returns Array of all registered UI handler names
 */
export function getRegisteredUIHandlers(): readonly UIIntentType[] {
  return UI_HANDLERS.map((h) => h.name);
}
