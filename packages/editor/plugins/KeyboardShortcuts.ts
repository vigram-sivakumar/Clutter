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
import { shouldDeferToUI } from './keyboard/utils';
import {
  copyToClipboard,
  cutToClipboard,
  pasteFromClipboard,
  getClipboardState,
} from '../core/clipboard/clipboardManager';

export const KeyboardShortcuts = Extension.create({
  name: 'keyboardShortcuts',

  // HIGH PRIORITY - must run BEFORE TabHandler (which has priority 100)
  priority: 1001,

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
      // 🔒 GOLDEN RULE: UI intent ALWAYS wins over structural intent
      ArrowLeft: ({ editor }) => {
        if (shouldDeferToUI(editor)) return false;
        return handleArrowLeft(editor);
      },
      ArrowRight: ({ editor }) => {
        if (shouldDeferToUI(editor)) return false;
        return handleArrowRight(editor);
      },
      ArrowUp: ({ editor }) => {
        if (shouldDeferToUI(editor)) return false;
        return handleArrowUp(editor);
      },
      ArrowDown: ({ editor }) => {
        if (shouldDeferToUI(editor)) return false;
        return handleArrowDown(editor);
      },

      // Cmd/Ctrl+C: Copy selected blocks
      'Mod-c': ({ editor }) => {
        copyToClipboard(editor.state);
        return true; // Always consume to prevent default browser copy
      },

      // Cmd/Ctrl+X: Cut selected blocks
      'Mod-x': ({ editor }) => {
        cutToClipboard(editor.state);
        return true; // Always consume
      },

      // Cmd/Ctrl+V: Paste clipboard content
      'Mod-v': ({ editor }) => {
        const clipboardState = getClipboardState();
        if (clipboardState) {
          pasteFromClipboard(editor.state);
          return true;
        }
        return false; // Let default paste handle it
      },
    };
  },
});
