/**
 * HashtagMenu - Inline #tag autocomplete for editor
 * Shows tag suggestions as user types #
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { useNotesStore, useAllTags } from '@clutter/state';
import {
  AutocompleteDropdown,
  DropdownItem,
  TagPill,
  useTheme,
} from '@clutter/ui';

interface HashtagMenuProps {
  editor: Editor | null;
}

export function HashtagMenu({ editor }: HashtagMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [query, setQuery] = useState('');

  const selectedIndexRef = useRef(selectedIndex);
  const notes = useNotesStore((state) => state.notes);
  const allTags = useAllTags();
  const { colors } = useTheme();

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

  // Calculate tag counts
  const tagsWithCounts = useMemo(() => {
    return allTags.map((tag) => {
      const count = notes.filter(
        (note) =>
          !note.deletedAt &&
          note.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
      ).length;
      return { tag, count };
    });
  }, [allTags, notes]);

  // Display tags with counts
  const displayTags = useMemo(() => {
    if (!query.trim()) {
      return [...tagsWithCounts].sort((a, b) =>
        a.tag.toLowerCase().localeCompare(b.tag.toLowerCase())
      );
    } else {
      return suggestions.map((tag) => {
        const tagData = tagsWithCounts.find(
          (t) => t.tag.toLowerCase() === tag.toLowerCase()
        );
        return { tag, count: tagData?.count || 0 };
      });
    }
  }, [query, tagsWithCounts, suggestions]);

  const handleClose = useCallback(() => {
    if (editor) {
      const storage = (editor.storage as any).hashtagTrigger;
      if (storage) {
        storage.active = false;
        storage.userClosed = true;
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

      setQuery(currentQuery);

      // Handle arrow navigation
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

      // Check if Enter was pressed
      if (storage.shouldSelect && isOpen) {
        storage.shouldSelect = false;

        let tagToSelect: string;
        if (suggestions.length > 0) {
          const indexToSelect = selectedIndex === -1 ? 0 : selectedIndex;
          tagToSelect = suggestions[indexToSelect];
        } else if (query.trim()) {
          tagToSelect = query.trim();
        } else {
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

          if (!wasOpen || startPosChanged) {
            setSelectedIndex(-1);
          }
        }
      } else {
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

      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        let tagToSelect: string;
        if (suggestions.length > 0) {
          const indexToSelect =
            selectedIndexRef.current === -1 ? 0 : selectedIndexRef.current;
          tagToSelect = suggestions[indexToSelect];
        } else if (query.trim()) {
          tagToSelect = query.trim();
        } else {
          return;
        }

        handleSelectTag(tagToSelect);
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, editor, suggestions, query, handleSelectTag]);

  if (!isOpen || !position) {
    return null;
  }

  // No matches but has query - show "Create" option
  if (displayTags.length === 0 && query.trim()) {
    const trimmedQuery = query.trim();

    return (
      <AutocompleteDropdown
        isOpen={isOpen}
        position={position}
        onClose={handleClose}
        selectedIndex={0}
      >
        <DropdownItem
          isSelected={selectedIndex === 0}
          onClick={() => handleSelectTag(trimmedQuery)}
          compact={true}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: colors.text.secondary, fontSize: '14px' }}>
              Create
            </span>
            <TagPill label={trimmedQuery} />
          </div>
        </DropdownItem>
      </AutocompleteDropdown>
    );
  }

  // No items to show at all
  if (displayTags.length === 0) {
    return null;
  }

  // Show regular tag suggestions
  return (
    <AutocompleteDropdown
      isOpen={isOpen}
      position={position}
      onClose={handleClose}
      selectedIndex={selectedIndex}
    >
      {displayTags.map(({ tag, count }, index) => (
        <DropdownItem
          key={tag}
          isSelected={index === selectedIndex}
          onClick={() => handleSelectTag(tag)}
          compact={true}
          count={count}
        >
          <TagPill label={tag} />
        </DropdownItem>
      ))}
    </AutocompleteDropdown>
  );
}
