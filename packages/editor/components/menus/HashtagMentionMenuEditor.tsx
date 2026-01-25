/**
 * HashtagMentionMenuEditor - Editor integration for hashtag mentions
 *
 * Wraps HashtagMentionMenu component and integrates with HashtagMention plugin
 * for inline #tag autocomplete in editor blocks
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { useAllTags } from '@clutter/state';
import { HashtagMentionMenu } from './HashtagMentionMenu';

interface HashtagMentionMenuEditorProps {
  editor: Editor | null;
}

export function HashtagMentionMenuEditor({
  editor,
}: HashtagMentionMenuEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [query, setQuery] = useState('');

  const selectedIndexRef = useRef(selectedIndex);

  // Get all available tags
  const allTags = useAllTags();

  // Filter tags based on query
  const suggestions = useMemo(() => {
    if (!query.trim()) {
      return allTags.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    }
    const lowerQuery = query.toLowerCase();
    return allTags
      .filter((tag) => tag.toLowerCase().includes(lowerQuery))
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }, [query, allTags]);

  const handleClose = useCallback(() => {
    if (editor) {
      const storage = (editor.storage as any).hashtagTrigger;
      if (storage) {
        storage.active = false;
        storage.userClosed = true; // Prevent auto-reopening
        // 🔒 Preserve selection when dispatching signal transaction
        const tr = editor.view.state.tr;
        tr.setSelection(editor.view.state.selection);
        editor.view.dispatch(tr);
      }
    }
  }, [editor]);

  const handleSelectTag = useCallback(
    (tag: string) => {
      if (!editor) return;

      const storage = (editor.storage as any).hashtagTrigger;
      if (!storage || storage.startPos === null) return;

      const { from } = editor.state.selection;

      // Insert hashtag mention node (delete #query and replace with styled hashtag + space)
      // Same pattern as AtMention (uses custom node instead of plain text)
      editor
        .chain()
        .focus()
        .deleteRange({ from: storage.startPos, to: from })
        .insertHashtagMention({ tag })
        .insertContent(' ')
        .run();

      handleClose();
    },
    [editor, handleClose]
  );

  // Keep ref in sync
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  // Subscribe to editor storage changes
  useEffect(() => {
    if (!editor) return;

    let cachedPosition: { top?: number; bottom?: number; left: number } | null =
      null;
    let cachedStartPos: number | null = null;

    const calculatePosition = (startPos: number) => {
      const coords = editor.view.coordsAtPos(startPos);

      return {
        top: coords.top,
        bottom: coords.bottom,
        left: coords.left,
      };
    };

    const updateMenu = () => {
      const storage = (editor.storage as any).hashtagTrigger;
      if (!storage) return;

      const wasOpen = isOpen;
      const isNowOpen = storage.active;
      const currentStartPos = storage.startPos;
      const currentQuery = storage.query || '';

      // Update query
      setQuery(currentQuery);

      // Handle arrow navigation (with wrap-around)
      if (storage.navigateDown) {
        storage.navigateDown = false;
        setSelectedIndex((prev) => {
          const itemCount = suggestions.length;
          const newIndex = prev === -1 ? 0 : (prev + 1) % itemCount;
          return newIndex;
        });
        return;
      }

      if (storage.navigateUp) {
        storage.navigateUp = false;
        setSelectedIndex((prev) => {
          const itemCount = suggestions.length;
          const newIndex =
            prev === -1 ? itemCount - 1 : (prev - 1 + itemCount) % itemCount;
          return newIndex;
        });
        return;
      }

      // Check if Enter was pressed (shouldSelect flag)
      if (storage.shouldSelect && isOpen) {
        storage.shouldSelect = false; // Reset flag
        
        // If we have suggestions, use the selected one
        // If no suggestions but we have a query, create new tag with query
        let tagToSelect: string;
        if (suggestions.length > 0) {
          const indexToSelect = selectedIndex === -1 ? 0 : selectedIndex;
          tagToSelect = suggestions[indexToSelect];
        } else if (query.trim()) {
          // Create mode - use the query as the tag name
          tagToSelect = query.trim();
        } else {
          // No suggestions and no query - nothing to select
          return;
        }
        
        handleSelectTag(tagToSelect);
        return;
      }

      setIsOpen(isNowOpen);

      // Calculate position when opening OR when startPos changes
      if (isNowOpen && currentStartPos !== null) {
        const startPosChanged = cachedStartPos !== currentStartPos;
        const queryChanged = currentQuery !== (storage as any).lastQuery;

        if (!wasOpen || startPosChanged || queryChanged) {
          requestAnimationFrame(() => {
            cachedPosition = calculatePosition(currentStartPos);
            cachedStartPos = currentStartPos;
            (storage as any).lastQuery = currentQuery;
            setPosition(cachedPosition);
          });

          // Reset selection to no item when menu opens
          if (!wasOpen || startPosChanged) {
            setSelectedIndex(-1);
          }
        }
      } else {
        // Menu closed - clear cache
        cachedPosition = null;
        cachedStartPos = null;
        (storage as any).lastQuery = '';
        setPosition(null);
        setSelectedIndex(-1);
      }
    };

    editor.on('transaction', updateMenu);
    updateMenu();

    return () => {
      editor.off('transaction', updateMenu);
    };
  }, [editor, suggestions, isOpen, selectedIndex, handleSelectTag]);

  // Global keyboard handler
  useEffect(() => {
    if (!isOpen || !editor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const storage = (editor.storage as any).hashtagTrigger;

      if (!storage?.active) {
        return;
      }

      // Handle ArrowDown (with wrap-around)
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setSelectedIndex((prev) => {
          const itemCount = suggestions.length;
          const newIndex = prev === -1 ? 0 : (prev + 1) % itemCount;
          return newIndex;
        });
      }

      // Handle ArrowUp (with wrap-around)
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setSelectedIndex((prev) => {
          const itemCount = suggestions.length;
          const newIndex =
            prev === -1 ? itemCount - 1 : (prev - 1 + itemCount) % itemCount;
          return newIndex;
        });
      }

      // Handle Enter
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        // If we have suggestions, use the selected one
        // If no suggestions but we have a query, create new tag with query
        let tagToSelect: string;
        if (suggestions.length > 0) {
          const indexToSelect =
            selectedIndexRef.current === -1 ? 0 : selectedIndexRef.current;
          tagToSelect = suggestions[indexToSelect];
        } else if (query.trim()) {
          // Create mode - use the query as the tag name
          tagToSelect = query.trim();
        } else {
          // No suggestions and no query - nothing to select
          return;
        }
        
        handleSelectTag(tagToSelect);
      }
    };

    // Add listener in capture phase with highest priority
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, editor, suggestions, query, handleSelectTag]);

  if (!isOpen || !position) {
    return null;
  }

  return (
    <HashtagMentionMenu
      isOpen={isOpen}
      position={position}
      onClose={handleClose}
      suggestions={suggestions}
      selectedIndex={selectedIndex}
      onSelectTag={handleSelectTag}
      query={query}
      existingTags={[]} // Could track tags in current note if needed
    />
  );
}
