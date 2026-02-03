/**
 * Keyboard Handler
 *
 * Single authoritative keyboard handler for ALL menus.
 * Prevents duplicate handlers and ensures consistent behavior.
 *
 * Rules:
 * - Editor never loses focus
 * - preventDefault only on commit
 * - Escape always restores editor state
 */

import type { MenuController, MenuIntent } from './types';

export interface KeyboardHandlerResult {
  handled: boolean;
  intent?: MenuIntent;
}

/**
 * Handle keyboard events for active menu
 *
 * @returns true if event was handled (should preventDefault)
 */
export function handleMenuKeyboard(
  event: KeyboardEvent,
  controller: MenuController,
  onCommit: (intent: MenuIntent) => void
): boolean {
  const { state } = controller;

  if (!state.isOpen) {
    return false;
  }

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      controller.navigate('down');
      return true;

    case 'ArrowUp':
      event.preventDefault();
      controller.navigate('up');
      return true;

    case 'Enter':
      event.preventDefault();
      // Commit is handled by the specific menu (calls controller.commit)
      return true;

    case 'Escape':
      event.preventDefault();
      controller.close('escape');
      return true;

    case 'Tab':
      // Tab navigates down (like arrows)
      if (!event.shiftKey) {
        event.preventDefault();
        controller.navigate('down');
        return true;
      }
      // Shift+Tab navigates up
      event.preventDefault();
      controller.navigate('up');
      return true;

    default:
      return false;
  }
}

/**
 * Create keyboard command handler for Lexical
 *
 * Wraps handleMenuKeyboard for use in Lexical's command system
 */
export function createMenuKeyboardCommand(
  controller: MenuController,
  onCommit: (intent: MenuIntent) => void
) {
  return (event: KeyboardEvent): boolean => {
    return handleMenuKeyboard(event, controller, onCommit);
  };
}
