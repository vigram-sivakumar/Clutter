/**
 * Slash Command Plugin
 *
 * Detects "/" trigger and shows command menu with keyboard navigation.
 */

import { useEffect, useState, useCallback } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  TextNode,
} from 'lexical';
import { createPortal } from 'react-dom';

import { CommandMenu } from './CommandMenu';
import { defaultCommandRegistry } from './registry.tsx';
import type { SlashCommand, CommandContext } from './types';

export interface SlashCommandPluginProps {
  /** Block ID for command context */
  blockId: string;
}

/**
 * Plugin that enables slash commands
 */
export function SlashCommandPlugin({ blockId }: SlashCommandPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [showMenu, setShowMenu] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [keyboardMode, setKeyboardMode] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    bottom: 0,
    left: 0,
  });

  // Get filtered commands
  const commands = defaultCommandRegistry.search(query);

  // Close menu
  const closeMenu = useCallback(() => {
    setShowMenu(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  // Execute command
  const executeCommand = useCallback(
    (command: SlashCommand) => {
      const context: CommandContext = {
        editor,
        blockId,
        query,
        closeMenu,
      };

      // Remove the "/" and query text
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const node = selection.anchor.getNode();
        if ($isTextNode(node)) {
          const text = node.getTextContent();
          const slashIndex = text.lastIndexOf('/');

          if (slashIndex !== -1) {
            // Remove from "/" to cursor
            const before = text.slice(0, slashIndex);
            const after = text.slice(selection.anchor.offset);
            node.setTextContent(before + after);

            // Set cursor position
            const newOffset = before.length;
            selection.anchor.set(node.getKey(), newOffset, 'text');
            selection.focus.set(node.getKey(), newOffset, 'text');
          }
        }
      });

      // Execute the command
      command.execute(context);
    },
    [editor, blockId, query, closeMenu]
  );

  // Monitor text input for "/"
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();

        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          if (showMenu) closeMenu();
          return;
        }

        const node = selection.anchor.getNode();

        if (!$isTextNode(node)) {
          if (showMenu) closeMenu();
          return;
        }

        const text = node.getTextContent();
        const offset = selection.anchor.offset;

        // Find last "/" before cursor
        const textBeforeCursor = text.slice(0, offset);
        const lastSlashIndex = textBeforeCursor.lastIndexOf('/');

        if (lastSlashIndex === -1) {
          if (showMenu) closeMenu();
          return;
        }

        // Check if "/" is at start of line or after space
        const charBeforeSlash =
          lastSlashIndex > 0 ? text[lastSlashIndex - 1] : ' ';
        const isValidTrigger = charBeforeSlash === ' ' || lastSlashIndex === 0;

        if (!isValidTrigger) {
          if (showMenu) closeMenu();
          return;
        }

        // Extract query after "/"
        const queryText = textBeforeCursor.slice(lastSlashIndex + 1);

        // Calculate position ONCE on open, never while open
        if (!showMenu) {
          const domSelection = window.getSelection();
          if (!domSelection || domSelection.rangeCount === 0) return;

          const range = domSelection.getRangeAt(0);
          const rect = range.getBoundingClientRect();

          // Pass anchor bounds only - FloatingMenu decides placement
          setMenuPosition({
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
          });

          setShowMenu(true);
        }

        // Update query (typing drives filtering, not layout)
        setQuery(queryText);
      });
    });
  }, [editor, showMenu, closeMenu]);

  // Keyboard navigation
  useEffect(() => {
    if (!showMenu) return;

    const removeArrowDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => {
        event.preventDefault();
        setKeyboardMode(true); // Enter keyboard mode
        setSelectedIndex((prev) => (prev < commands.length - 1 ? prev + 1 : 0));
        return true;
      },
      COMMAND_PRIORITY_LOW
    );

    const removeArrowUp = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event) => {
        event.preventDefault();
        setKeyboardMode(true); // Enter keyboard mode
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : commands.length - 1));
        return true;
      },
      COMMAND_PRIORITY_LOW
    );

    const removeEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (commands.length > 0) {
          event.preventDefault();
          executeCommand(commands[selectedIndex]);
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    const removeEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event) => {
        event.preventDefault();
        closeMenu();
        return true;
      },
      COMMAND_PRIORITY_LOW
    );

    return () => {
      removeArrowDown();
      removeArrowUp();
      removeEnter();
      removeEscape();
    };
  }, [editor, showMenu, commands, selectedIndex, executeCommand, closeMenu]);

  // Close menu on click outside
  useEffect(() => {
    if (!showMenu) return;

    const handleClickOutside = () => {
      closeMenu();
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu, closeMenu]);

  if (!showMenu) {
    return null;
  }

  return createPortal(
    <div onMouseMove={() => setKeyboardMode(false)}>
      <CommandMenu
        commands={commands}
        selectedIndex={selectedIndex}
        onSelect={executeCommand}
        position={menuPosition}
        query={query}
        onClose={closeMenu}
        onHoverItem={(index) => {
          if (!keyboardMode) {
            setSelectedIndex(index);
          }
        }}
      />
    </div>,
    document.body
  );
}
