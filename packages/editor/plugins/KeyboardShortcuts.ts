/**
 * KeyboardShortcuts Plugin - Centralized structural keyboard shortcuts
 *
 * Direct key → handler wiring (no intents, no resolver, no engine)
 * - Handlers return boolean: true = consumed, false = fallback
 * - All structural keyboard logic uses direct ProseMirror transactions
 */

import { Extension } from '@tiptap/core';
import {
  handleTab,
  handleBackspace,
  handleEnter,
  handleArrowLeft,
  handleArrowRight,
  handleArrowUp,
  handleArrowDown,
} from './keyboard/keymaps';
import {
  copyToClipboard,
  cutToClipboard,
  pasteFromClipboard,
  getClipboardState,
} from '../core/clipboard/clipboardManager';

export const KeyboardShortcuts = Extension.create({
  name: 'keyboardShortcuts',

  // HIGH PRIORITY - must run BEFORE TabHandler (which has priority 100)
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      // Tab / Shift+Tab: Indent / Outdent blocks
      Tab: ({ editor }) => handleTab(editor, false),
      'Shift-Tab': ({ editor }) => handleTab(editor, true),

      // Enter: Split block and preserve structure
      Enter: ({ editor }) => handleEnter(editor),

      // Backspace: Outdent if at start of indented block
      Backspace: ({ editor }) => {
        return handleBackspace(editor);
      },

      // Arrow keys: Navigate between blocks
      ArrowLeft: ({ editor }) => {
        const result = handleArrowLeft(editor);
        return result.handled;
      },
      ArrowRight: ({ editor }) => {
        const result = handleArrowRight(editor);
        return result.handled;
      },
      ArrowUp: ({ editor }) => {
        const result = handleArrowUp(editor);
        return result.handled;
      },
      ArrowDown: ({ editor }) => {
        const result = handleArrowDown(editor);
        return result.handled;
      },

      // Cmd/Ctrl+C: Copy selected blocks
      'Mod-c': ({ editor }) => {
        copyToClipboard(editor);
        return true; // Always consume to prevent default browser copy
      },

      // Cmd/Ctrl+X: Cut selected blocks
      'Mod-x': ({ editor }) => {
        cutToClipboard(editor);
        return true; // Always consume
      },

      // Cmd/Ctrl+V: Paste clipboard content
      'Mod-v': ({ editor }) => {
        const clipboardState = getClipboardState();
        if (clipboardState) {
          pasteFromClipboard(editor);
          return true;
        }
        return false; // Let default paste handle it
      },
    };
  },
});
