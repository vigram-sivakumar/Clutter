/**
 * AtMentionMenu - Menu component for @ mentions (dates + links)
 * Renders dropdown with two sections: DATE and LINK TO
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import {
  AutocompleteDropdown,
  DropdownItem,
  DropdownHeader,
  DropdownSeparator,
} from '@clutter/ui';
import { At, CalendarBlank, Note, Folder } from '@clutter/ui';
import {
  filterDateSuggestions,
  type DateSuggestion,
} from '../utils/dateParser';
import { searchEntities, type EntitySuggestion } from '../utils/entitySearch';
import { useEditorContext } from '../context/EditorContext';

interface AtMentionMenuProps {
  editor: Editor | null;
  onNavigate?: (type: 'note' | 'folder', id: string) => void;
}

type MenuItem =
  | { type: 'date'; suggestion: DateSuggestion }
  | { type: 'createDailyNote'; date: DateSuggestion }
  | { type: 'entity'; suggestion: EntitySuggestion }
  | { type: 'createNote'; query: string }
  | { type: 'createFolder'; query: string };

export function AtMentionMenu({ editor, onNavigate }: AtMentionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1); // -1 = no selection
  const [query, setQuery] = useState('');
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const selectedIndexRef = useRef(selectedIndex);
  const menuItemsRef = useRef<MenuItem[]>([]);
  const handleItemClickRef = useRef<((item: MenuItem) => void) | null>(null);

  // Get context
  const {
    availableNotes,
    availableFolders,
    onCreateNote,
    onCreateFolder,
    onFindDailyNote,
    onCreateDailyNote,
  } = useEditorContext();

  // Get date suggestions
  const dateSuggestions = useMemo(() => {
    return filterDateSuggestions(query);
  }, [query]);

  // Get entity suggestions
  const entityResults = useMemo(() => {
    return searchEntities(query, availableNotes, availableFolders);
  }, [query, availableNotes, availableFolders]);

  // Build complete menu items list
  const menuItems = useMemo((): MenuItem[] => {
    const items: MenuItem[] = [];

    // Check if daily note exists for the date suggestion
    let existingDailyNote = null;
    if (dateSuggestions.length > 0) {
      const dateStr = dateSuggestions[0].date; // ISO format YYYY-MM-DD
      const [year, month, day] = dateStr.split('-').map(Number);
      const targetDate = new Date(year, month - 1, day);
      existingDailyNote = onFindDailyNote(targetDate);
    }

    // 1. DATE section - pure date mention
    if (dateSuggestions.length > 0) {
      const dateSuggestion = dateSuggestions[0];
      items.push({ type: 'date', suggestion: dateSuggestion });
    }

    // 2. DAILY NOTE section - create or link to existing daily note
    if (dateSuggestions.length > 0) {
      if (existingDailyNote) {
        // Show existing daily note
        items.push({
          type: 'entity',
          suggestion: {
            type: 'note',
            id: existingDailyNote.id,
            title: existingDailyNote.title,
            emoji: existingDailyNote.emoji,
            isDailyNote: true,
          },
        });
      } else {
        // Show create option
        items.push({ type: 'createDailyNote', date: dateSuggestions[0] });
      }
    }

    // 3. LINK TO section - regular notes and folders (excluding daily notes)
    const regularMatches = entityResults.matches.filter((s) => !s.isDailyNote);
    const hasLinkSection =
      regularMatches.length > 0 ||
      entityResults.showCreateNote ||
      entityResults.showCreateFolder;

    if (hasLinkSection) {
      // Entity matches (excluding daily notes - they're in their own section)
      regularMatches.forEach((suggestion) => {
        items.push({ type: 'entity', suggestion });
      });

      // Create options
      if (entityResults.showCreateNote) {
        items.push({ type: 'createNote', query });
      }
      if (entityResults.showCreateFolder) {
        items.push({ type: 'createFolder', query });
      }
    }

    return items;
  }, [dateSuggestions, entityResults, query, onFindDailyNote]);

  const handleClose = useCallback(() => {
    if (editor) {
      const storage = (editor.storage as any).atMention;
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

  const handleItemClick = useCallback(
    (item: MenuItem) => {
      if (!editor) return;

      const storage = (editor.storage as any).atMention;
      if (!storage || storage.startPos === null) return;

      const { from } = editor.state.selection;

      switch (item.type) {
        case 'date': {
          // Insert date mention (keeps @)
          editor
            .chain()
            .focus()
            .deleteRange({ from: storage.startPos, to: from })
            .insertDateMention({
              date: item.suggestion.date,
              label: item.suggestion.label,
            })
            .insertContent(' ')
            .run();
          break;
        }

        case 'createDailyNote': {
          // Parse date from suggestion
          const dateStr = item.date.date; // ISO format YYYY-MM-DD
          const [year, month, day] = dateStr.split('-').map(Number);
          const targetDate = new Date(year, month - 1, day);

          // Check if daily note already exists
          const existingNote = onFindDailyNote(targetDate);
          const dailyNote =
            existingNote || onCreateDailyNote(targetDate, false); // Don't navigate

          // Insert link to daily note (NO @ - NodeView will render icon)
          editor
            .chain()
            .focus()
            .deleteRange({ from: storage.startPos, to: from })
            .insertNoteLink({
              linkType: 'note',
              targetId: dailyNote.id,
              label: dailyNote.title, // Just title, no emoji/icon
              emoji: dailyNote.emoji, // Store emoji separately
            })
            .insertContent(' ')
            .run();

          // Don't navigate (per user requirement)
          break;
        }

        case 'entity': {
          // Insert link to existing entity (NO @ - NodeView will render icon)
          const { suggestion } = item;

          editor
            .chain()
            .focus()
            .deleteRange({ from: storage.startPos, to: from })
            .insertNoteLink({
              linkType: suggestion.type,
              targetId: suggestion.id,
              label: suggestion.title, // Just title, no emoji/icon
              emoji: suggestion.emoji, // Store emoji separately
            })
            .insertContent(' ')
            .run();
          break;
        }

        case 'createNote': {
          // Create new note and link to it (NO @ - NodeView will render icon)
          const newNote = onCreateNote({ title: item.query }, false); // Don't navigate

          editor
            .chain()
            .focus()
            .deleteRange({ from: storage.startPos, to: from })
            .insertNoteLink({
              linkType: 'note',
              targetId: newNote.id,
              label: newNote.title, // Just title, no icon
              emoji: null,
            })
            .insertContent(' ')
            .run();

          // Don't navigate (per user requirement)
          break;
        }

        case 'createFolder': {
          // Create new folder and link to it (NO @ - NodeView will render icon)
          const newFolderId = onCreateFolder(item.query);
          if (newFolderId) {
            editor
              .chain()
              .focus()
              .deleteRange({ from: storage.startPos, to: from })
              .insertNoteLink({
                linkType: 'folder',
                targetId: newFolderId,
                label: item.query, // Just title, no icon
                emoji: null,
              })
              .insertContent(' ')
              .run();
          }
          // Don't navigate (per user requirement)
          break;
        }
      }

      handleClose();
    },
    [
      editor,
      handleClose,
      onCreateNote,
      onCreateFolder,
      onFindDailyNote,
      onCreateDailyNote,
      onNavigate,
    ]
  );

  // Keep refs in sync with latest values
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
    menuItemsRef.current = menuItems;
    handleItemClickRef.current = handleItemClick;
  }, [selectedIndex, menuItems, handleItemClick]);

  // Subscribe to editor storage changes
  useEffect(() => {
    if (!editor) return;

    let cachedPosition: { top?: number; bottom?: number; left: number } | null =
      null;
    let cachedStartPos: number | null = null;

    const calculatePosition = (startPos: number) => {
      const coords = editor.view.coordsAtPos(startPos);

      const menuWidth = 220;
      const menuMaxHeight = 300;
      const gap = 4;

      // Calculate actual menu height based on current items (header + items + padding)
      const itemCount = menuItemsRef.current.length;
      const headerHeight = 24; // Section headers (DATE, DAILY NOTE, LINK TO)
      const itemHeight = 32; // Each dropdown item (28px + gaps)
      const padding = 8; // Container padding
      const separatorHeight = 8; // Separators between sections

      // More accurate height: count headers, items, separators, padding
      const sectionCount = itemCount > 0 ? (itemCount <= 2 ? 2 : 3) : 1; // DATE, DAILY NOTE, maybe LINK TO
      const estimatedMenuHeight = Math.min(
        menuMaxHeight,
        itemCount * itemHeight +
          headerHeight * sectionCount +
          padding * 2 +
          separatorHeight * (sectionCount - 1)
      );

      // Viewport boundaries
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Determine if we should show above or below
      const spaceBelow = viewportHeight - coords.bottom;
      const spaceAbove = coords.top;
      const showAbove =
        spaceBelow < estimatedMenuHeight + gap + 8 && spaceAbove > spaceBelow;

      let left = coords.left;

      // Check if menu goes beyond right edge
      if (left + menuWidth > viewportWidth) {
        left = viewportWidth - menuWidth - 8;
      }
      left = Math.max(8, left);

      if (showAbove) {
        // Anchor to bottom (distance from bottom of viewport to top of @ symbol)
        // Add small gap to keep @ visible
        const bottom = viewportHeight - coords.top + gap + 4;
        return { bottom, left };
      } else {
        // Show below cursor
        const top = coords.bottom + gap;
        return { top, left };
      }
    };

    const updateMenu = () => {
      const storage = (editor.storage as any).atMention;
      if (!storage) return;

      const wasOpen = isOpen;
      const isNowOpen = storage.active;
      const currentStartPos = storage.startPos;
      const currentQuery = storage.query || '';

      // Update query
      setQuery(currentQuery);

      // Handle arrow navigation
      if (storage.navigateDown) {
        storage.navigateDown = false;
        setSelectedIndex((prev) => {
          const newIndex =
            prev === -1 ? 0 : Math.min(prev + 1, menuItems.length - 1);
          // Scroll into view on next tick
          setTimeout(() => {
            itemRefs.current[newIndex]?.scrollIntoView({
              block: 'nearest',
              behavior: 'smooth',
            });
          }, 0);
          return newIndex;
        });
        return;
      }

      if (storage.navigateUp) {
        storage.navigateUp = false;
        setSelectedIndex((prev) => {
          const newIndex = prev === -1 ? 0 : Math.max(prev - 1, 0);
          // Scroll into view on next tick
          setTimeout(() => {
            itemRefs.current[newIndex]?.scrollIntoView({
              block: 'nearest',
              behavior: 'smooth',
            });
          }, 0);
          return newIndex;
        });
        return;
      }

      // Check if Enter was pressed (shouldSelect flag)
      if (storage.shouldSelect && isOpen && menuItems.length > 0) {
        storage.shouldSelect = false; // Reset flag
        const indexToSelect = selectedIndex === -1 ? 0 : selectedIndex; // Default to first item
        handleItemClick(menuItems[indexToSelect]);
        return;
      }

      setIsOpen(isNowOpen);

      // Calculate position when opening OR when startPos changes OR when menu items change
      if (isNowOpen && currentStartPos !== null) {
        const startPosChanged = cachedStartPos !== currentStartPos;
        const queryChanged = currentQuery !== (storage as any).lastQuery;

        if (!wasOpen || startPosChanged || queryChanged) {
          // Menu just opened OR moved to different @ position OR query changed (items may have changed)
          // Use RAF to batch position updates for smooth transitions
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
  }, [editor, menuItems, handleItemClick]); // Removed isOpen and selectedIndex to prevent interference

  // Global keyboard handler to intercept keys before editor gets them
  useEffect(() => {
    if (!isOpen || !editor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const storage = (editor.storage as any).atMention;

      if (!storage?.active) {
        return;
      }

      // Handle ArrowDown
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setSelectedIndex((prev) => {
          const newIndex =
            prev === -1
              ? 0
              : Math.min(prev + 1, menuItemsRef.current.length - 1);
          setTimeout(() => {
            itemRefs.current[newIndex]?.scrollIntoView({
              block: 'nearest',
              behavior: 'smooth',
            });
          }, 0);
          return newIndex;
        });
      }

      // Handle ArrowUp
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setSelectedIndex((prev) => {
          const newIndex = prev === -1 ? 0 : Math.max(prev - 1, 0);
          setTimeout(() => {
            itemRefs.current[newIndex]?.scrollIntoView({
              block: 'nearest',
              behavior: 'smooth',
            });
          }, 0);
          return newIndex;
        });
      }

      // Handle Enter
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const indexToSelect =
          selectedIndexRef.current === -1 ? 0 : selectedIndexRef.current;
        if (menuItemsRef.current[indexToSelect] && handleItemClickRef.current) {
          handleItemClickRef.current(menuItemsRef.current[indexToSelect]);
        }
      }

      // ESC is handled by FloatingMenu via dismissOnEscape prop
      // No need for duplicate handler here - UI layer owns dismissal interactions
    };

    // Add listener in capture phase with highest priority
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, editor]); // Removed selectedIndex, menuItems, handleItemClick from deps to prevent constant re-mounting

  if (!isOpen || !position || menuItems.length === 0) {
    return null;
  }

  // Render menu items with sections
  const renderMenuItems = () => {
    const items: JSX.Element[] = [];
    let hasRenderedDateSection = false;
    let hasRenderedDailyNoteSection = false;
    let inLinkSection = false;

    menuItems.forEach((item, index) => {
      // Add DATE header before first date item
      if (index === 0 && item.type === 'date') {
        items.push(<DropdownHeader key="date-header" label="DATE" />);
        hasRenderedDateSection = true;
      }

      // Add DAILY NOTE header before first daily note item
      if (
        !hasRenderedDailyNoteSection &&
        (item.type === 'createDailyNote' ||
          (item.type === 'entity' && item.suggestion.isDailyNote))
      ) {
        hasRenderedDailyNoteSection = true;
        // Only add separator if we rendered date section before
        if (hasRenderedDateSection) {
          items.push(<DropdownSeparator key="separator-daily" />);
        }
        items.push(
          <DropdownHeader key="daily-note-header" label="DAILY NOTE" />
        );
      }

      // Add LINK TO header before first entity/create item (non-daily-note)
      if (
        !inLinkSection &&
        ((item.type === 'entity' && !item.suggestion.isDailyNote) ||
          item.type === 'createNote' ||
          item.type === 'createFolder')
      ) {
        inLinkSection = true;
        // Only add separator if we rendered previous sections
        if (hasRenderedDateSection || hasRenderedDailyNoteSection) {
          items.push(<DropdownSeparator key="separator-link" />);
        }
        items.push(<DropdownHeader key="link-header" label="LINK TO" />);
      }

      // Render item
      switch (item.type) {
        case 'date':
          items.push(
            <div
              key={`date-${index}`}
              ref={(el) => (itemRefs.current[index] = el)}
            >
              <DropdownItem
                icon={<At />}
                label={item.suggestion.label}
                description={item.suggestion.description}
                isSelected={selectedIndex === index}
                onClick={() => handleItemClick(item)}
              />
            </div>
          );
          break;

        case 'createDailyNote':
          items.push(
            <div
              key={`create-daily-${index}`}
              ref={(el) => (itemRefs.current[index] = el)}
            >
              <DropdownItem
                icon={<CalendarBlank />}
                label={`Create "${query}"`}
                isSelected={selectedIndex === index}
                onClick={() => handleItemClick(item)}
              />
            </div>
          );
          break;

        case 'entity': {
          const { suggestion } = item;
          // Use CalendarBlank for daily notes, Note for regular notes, Folder for folders
          const icon = suggestion.isDailyNote ? (
            <CalendarBlank />
          ) : suggestion.type === 'folder' ? (
            <Folder />
          ) : (
            <Note />
          );
          const emoji = suggestion.emoji;
          const displayLabel = emoji
            ? `${emoji} ${suggestion.title}`
            : suggestion.title;

          items.push(
            <div
              key={`entity-${index}`}
              ref={(el) => (itemRefs.current[index] = el)}
            >
              <DropdownItem
                icon={!emoji ? icon : undefined}
                label={displayLabel}
                isSelected={selectedIndex === index}
                onClick={() => handleItemClick(item)}
              />
            </div>
          );
          break;
        }

        case 'createNote':
          items.push(
            <div
              key={`create-note-${index}`}
              ref={(el) => (itemRefs.current[index] = el)}
            >
              <DropdownItem
                icon={<Note />}
                label={`Create "${item.query}"`}
                isSelected={selectedIndex === index}
                onClick={() => handleItemClick(item)}
              />
            </div>
          );
          break;

        case 'createFolder':
          items.push(
            <div
              key={`create-folder-${index}`}
              ref={(el) => (itemRefs.current[index] = el)}
            >
              <DropdownItem
                icon={<Folder />}
                label={`Create "${item.query}"`}
                isSelected={selectedIndex === index}
                onClick={() => handleItemClick(item)}
              />
            </div>
          );
          break;
      }
    });

    return items;
  };

  return (
    <AutocompleteDropdown
      isOpen={isOpen}
      position={position}
      onClose={handleClose}
    >
      {renderMenuItems()}
    </AutocompleteDropdown>
  );
}
