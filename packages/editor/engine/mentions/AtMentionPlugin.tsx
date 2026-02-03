/**
 * @Mention Plugin
 *
 * Detects "@" trigger and shows suggestion menu for:
 * - Date mentions (Today, Tomorrow, etc.)
 * - Daily notes (create or link)
 * - Regular notes and folders
 *
 * Uses shared dropdown primitives for exact visual parity.
 *
 * Architecture:
 * - Trigger detection in Lexical
 * - Pull-based positioning
 * - Editor owns focus
 * - Zero remounts
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
} from 'lexical';
import { createPortal } from 'react-dom';

import { AtMentionMenu } from './AtMentionMenu';
import { filterDateSuggestions } from '../utils/dateParser';
import { searchEntities } from '../utils/entitySearch';
import type { EditorNote, EditorFolder } from '../utils/entitySearch';
import type { DateSuggestion } from '../utils/dateParser';

export interface AtMentionPluginProps {
  blockId: string;
  /** Available notes for linking */
  availableNotes?: EditorNote[];
  /** Available folders for linking */
  availableFolders?: EditorFolder[];
  /** Callback when user wants to create a note */
  onCreateNote?: (title: string) => Promise<{ id: string; title: string }>;
  /** Callback when user wants to create a folder */
  onCreateFolder?: (name: string) => Promise<{ id: string; name: string }>;
  /** Callback when user wants to find/create daily note */
  onFindOrCreateDailyNote?: (date: string) => Promise<{
    id: string;
    title: string;
    exists: boolean;
  }>;
}

export function AtMentionPlugin({
  blockId,
  availableNotes = [],
  availableFolders = [],
  onCreateNote,
  onCreateFolder,
  onFindOrCreateDailyNote,
}: AtMentionPluginProps) {
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
  const [triggerPos, setTriggerPos] = useState<number | null>(null);

  // Close menu
  const closeMenu = useCallback(() => {
    setShowMenu(false);
    setQuery('');
    setSelectedIndex(0);
    setTriggerPos(null);
  }, []);

  // Get suggestions
  const dateSuggestions = filterDateSuggestions(query);
  const entityResults = searchEntities(query, availableNotes, availableFolders);

  // TODO: Build menu items from suggestions
  // For now, just showing a placeholder structure

  // Detect "@" trigger and track query
  useEffect(() => {
    const updateTrigger = () => {
      editor.getEditorState().read(() => {
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

        // Find last "@" before cursor
        const textBeforeCursor = text.slice(0, offset);
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');

        // No "@" or "@" is not at valid position
        if (lastAtIndex === -1) {
          if (showMenu) closeMenu();
          return;
        }

        // Check if "@" is at start or after space
        const charBeforeAt = textBeforeCursor[lastAtIndex - 1];
        if (lastAtIndex > 0 && charBeforeAt !== ' ' && charBeforeAt !== '\n') {
          if (showMenu) closeMenu();
          return;
        }

        // Extract query after "@"
        const queryText = textBeforeCursor.slice(lastAtIndex + 1);

        // Calculate anchor position (once on open)
        const domSelection = window.getSelection();
        if (!domSelection || domSelection.rangeCount === 0) {
          if (showMenu) closeMenu();
          return;
        }

        const range = domSelection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Pass anchor bounds only - FloatingMenu decides placement
        setMenuPosition({
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
        });
        setQuery(queryText);
        setTriggerPos(lastAtIndex);
        setShowMenu(true);
      });
    };

    const unregister = editor.registerUpdateListener(() => {
      updateTrigger();
    });

    return unregister;
  }, [editor, showMenu, closeMenu]);

  // Keyboard navigation
  useEffect(() => {
    if (!showMenu) return;

    const handleArrowDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      () => {
        setKeyboardMode(true); // Enter keyboard mode
        setSelectedIndex((prev) => Math.min(prev + 1, 5)); // TODO: Use actual item count
        return true;
      },
      COMMAND_PRIORITY_LOW
    );

    const handleArrowUp = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      () => {
        setKeyboardMode(true); // Enter keyboard mode
        setSelectedIndex((prev) => Math.max(0, prev - 1));
        return true;
      },
      COMMAND_PRIORITY_LOW
    );

    const handleEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      () => {
        // TODO: Execute selected item
        closeMenu();
        return true;
      },
      COMMAND_PRIORITY_LOW
    );

    const handleEscape = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        closeMenu();
        return true;
      },
      COMMAND_PRIORITY_LOW
    );

    return () => {
      handleArrowDown();
      handleArrowUp();
      handleEnter();
      handleEscape();
    };
  }, [editor, showMenu, closeMenu]);

  if (!showMenu) {
    return null;
  }

  return createPortal(
    <div onMouseMove={() => setKeyboardMode(false)}>
      <AtMentionMenu
        query={query}
        selectedIndex={selectedIndex}
        position={menuPosition}
        onClose={closeMenu}
        dateSuggestions={dateSuggestions}
        entityMatches={entityResults.matches}
        showCreateNote={entityResults.showCreateNote}
        showCreateFolder={entityResults.showCreateFolder}
        onSelect={(item) => {
          // TODO: Insert mention based on item type
          console.log('[AtMention] Selected:', item);
          closeMenu();
        }}
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
