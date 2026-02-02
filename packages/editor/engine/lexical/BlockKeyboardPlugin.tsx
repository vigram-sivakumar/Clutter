/**
 * Block Keyboard Plugin
 *
 * Handles block-level keyboard behaviors:
 * - Enter: Split block
 * - Backspace at start: Merge with previous
 * - Up/Down arrows: Navigate between blocks
 */

import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
} from 'lexical';

export interface BlockKeyboardPluginProps {
  blockId: string;
  onEnter: (blockId: string, offset: number) => void;
  onBackspaceAtStart: (blockId: string) => void;
  onArrowUp: (blockId: string) => void;
  onArrowDown: (blockId: string) => void;
}

/**
 * Plugin for handling block-level keyboard shortcuts
 */
export function BlockKeyboardPlugin({
  blockId,
  onEnter,
  onBackspaceAtStart,
  onArrowUp,
  onArrowDown,
}: BlockKeyboardPluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Handle Enter key - split block
    const removeEnterCommand = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent) => {
        const selection = $getSelection();

        if (!$isRangeSelection(selection)) {
          return false;
        }

        // Prevent default Lexical behavior
        event.preventDefault();

        // Get cursor offset
        const anchorOffset = selection.anchor.offset;

        // Call split handler
        onEnter(blockId, anchorOffset);

        return true; // Handled
      },
      COMMAND_PRIORITY_HIGH
    );

    // Handle Backspace at start - merge blocks
    const removeBackspaceCommand = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event: KeyboardEvent) => {
        const selection = $getSelection();

        if (!$isRangeSelection(selection)) {
          return false;
        }

        // Only handle if cursor is at start
        const anchorOffset = selection.anchor.offset;
        if (anchorOffset !== 0) {
          return false; // Let Lexical handle normal backspace
        }

        // Check if selection is collapsed (no text selected)
        if (!selection.isCollapsed()) {
          return false; // Let Lexical handle deletion
        }

        // Prevent default Lexical behavior
        event.preventDefault();

        // Call merge handler
        onBackspaceAtStart(blockId);

        return true; // Handled
      },
      COMMAND_PRIORITY_HIGH
    );

    // Handle Up arrow - focus previous block
    const removeArrowUpCommand = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event: KeyboardEvent) => {
        const selection = $getSelection();

        if (!$isRangeSelection(selection)) {
          return false;
        }

        // Only handle if cursor is at start/beginning of content
        const anchorOffset = selection.anchor.offset;
        if (anchorOffset !== 0) {
          return false; // Let Lexical handle normal navigation
        }

        // Prevent default
        event.preventDefault();

        // Focus previous block
        onArrowUp(blockId);

        return true;
      },
      COMMAND_PRIORITY_HIGH
    );

    // Handle Down arrow - focus next block
    const removeArrowDownCommand = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        const selection = $getSelection();

        if (!$isRangeSelection(selection)) {
          return false;
        }

        // Get text content length
        const textContent = editor.getEditorState().read(() => {
          const root = editor.getRootElement();
          return root?.textContent || '';
        });

        // Only handle if cursor is at end
        const anchorOffset = selection.anchor.offset;
        if (anchorOffset !== textContent.length) {
          return false; // Let Lexical handle normal navigation
        }

        // Prevent default
        event.preventDefault();

        // Focus next block
        onArrowDown(blockId);

        return true;
      },
      COMMAND_PRIORITY_HIGH
    );

    // Cleanup
    return () => {
      removeEnterCommand();
      removeBackspaceCommand();
      removeArrowUpCommand();
      removeArrowDownCommand();
    };
  }, [editor, blockId, onEnter, onBackspaceAtStart, onArrowUp, onArrowDown]);

  return null;
}
