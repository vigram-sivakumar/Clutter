/**
 * Formatting Plugin
 *
 * Handles keyboard shortcuts for text formatting:
 * - Cmd/Ctrl + B = Bold
 * - Cmd/Ctrl + I = Italic
 * - Cmd/Ctrl + U = Underline
 * - Cmd/Ctrl + E = Code
 * - Cmd/Ctrl + Shift + X = Strikethrough
 */

import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_MODIFIER_COMMAND,
} from 'lexical';

/**
 * Plugin for handling text formatting shortcuts
 */
export function FormattingPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Register keyboard shortcuts
    const removeKeyHandler = editor.registerCommand(
      KEY_MODIFIER_COMMAND,
      (payload) => {
        const event = payload as KeyboardEvent;
        const { code, ctrlKey, metaKey, shiftKey } = event;

        // Check if Cmd (Mac) or Ctrl (Windows/Linux) is pressed
        const isModifier = metaKey || ctrlKey;

        if (!isModifier) {
          return false;
        }

        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return false;
        }

        // Bold: Cmd/Ctrl + B
        if (code === 'KeyB' && !shiftKey) {
          event.preventDefault();
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
          return true;
        }

        // Italic: Cmd/Ctrl + I
        if (code === 'KeyI' && !shiftKey) {
          event.preventDefault();
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
          return true;
        }

        // Underline: Cmd/Ctrl + U
        if (code === 'KeyU' && !shiftKey) {
          event.preventDefault();
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
          return true;
        }

        // Code: Cmd/Ctrl + E
        if (code === 'KeyE' && !shiftKey) {
          event.preventDefault();
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');
          return true;
        }

        // Strikethrough: Cmd/Ctrl + Shift + X
        if (code === 'KeyX' && shiftKey) {
          event.preventDefault();
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough');
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    return () => {
      removeKeyHandler();
    };
  }, [editor]);

  return null;
}
