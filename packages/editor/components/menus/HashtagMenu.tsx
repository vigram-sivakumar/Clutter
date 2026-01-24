/**
 * HashtagMenu - Autocomplete menu for #hashtags
 * Uses the same AutocompleteDropdown as page title tags
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import {
  AutocompleteDropdown,
  DropdownItem,
} from '@clutter/ui';
import { HashStraight } from '@clutter/ui';
import { useEditorContext } from '../../context/EditorContext';
import { useEditorTheme } from '../../theme/EditorThemeContext';
import { getTagColor } from '@clutter/ui';
import { insertTag } from '../../utils/tagUtils';

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
  const [hashtagRange, setHashtagRange] = useState<{ from: number; to: number } | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const selectedIndexRef = useRef(selectedIndex);
  
  const { colors } = useEditorTheme();
  const { availableTags } = useEditorContext();

  // Update ref when selectedIndex changes
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  // Get filtered tag suggestions
  const suggestions = useMemo(() => {
    const allTags = availableTags.map(t => t.label);
    
    if (!query) {
      // Empty query - show all tags
      return allTags.slice(0, 10);
    }
    
    // Filter by query
    const filtered = allTags.filter(tag => 
      tag.toLowerCase().startsWith(query.toLowerCase())
    );
    
    return filtered.slice(0, 10);
  }, [query, availableTags]);

  // Show "Create" option when no matches
  const showCreateOption = suggestions.length === 0 && query.trim() !== '';

  // Combined menu items
  const menuItems = useMemo(() => {
    if (showCreateOption) {
      return [{ type: 'create' as const, label: query.trim() }];
    }
    return suggestions.map(label => ({ type: 'tag' as const, label }));
  }, [suggestions, showCreateOption, query]);

  // Listen to plugin state
  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      const state = editor.storage.hashtagAutocomplete;
      
      if (state?.active) {
        setIsOpen(true);
        setQuery(state.query || '');
        setHashtagRange(state.range || null);
        setSelectedIndex(state.selectedIndex ?? -1);
        
        // Calculate position
        const { from } = editor.view.state.selection;
        const coords = editor.view.coordsAtPos(from);
        setPosition({
          top: coords.bottom + 4,
          left: coords.left,
        });
      } else {
        setIsOpen(false);
        setPosition(null);
        setQuery('');
        setHashtagRange(null);
        setSelectedIndex(-1);
      }
    };

    // Listen to editor updates
    editor.on('update', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);

    return () => {
      editor.off('update', handleUpdate);
      editor.off('selectionUpdate', handleUpdate);
    };
  }, [editor]);

  // Handle tag selection
  const handleSelectTag = useCallback((tagLabel: string) => {
    if (!editor || !hashtagRange) return;

    const { state, view } = editor;
    const { from, to } = hashtagRange;
    
    // Get current block
    const $pos = state.doc.resolve(from);
    const currentBlock = $pos.parent;
    const blockPos = $pos.before($pos.depth);
    
    // Use shared insertTag utility
    const tr = state.tr;
    insertTag(tr, from - 1, to, blockPos, currentBlock.attrs, tagLabel);
    
    view.dispatch(tr);
    view.focus();
    
    // Close menu
    setIsOpen(false);
  }, [editor, hashtagRange]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!editor || !isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return false;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((prev) => 
          prev < menuItems.length - 1 ? prev + 1 : 0
        );
        return true;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((prev) => 
          prev > 0 ? prev - 1 : menuItems.length - 1
        );
        return true;
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        if (selectedIndexRef.current >= 0 && selectedIndexRef.current < menuItems.length) {
          const item = menuItems[selectedIndexRef.current];
          handleSelectTag(item.label);
        } else if (menuItems.length > 0) {
          // No selection, use first item
          handleSelectTag(menuItems[0].label);
        }
        return true;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        return true;
      }

      return false;
    };

    // Add to editor view's DOM
    const editorDom = editor.view.dom;
    editorDom.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      editorDom.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [editor, isOpen, menuItems, handleSelectTag]);

  if (!isOpen || !position) return null;

  return (
    <AutocompleteDropdown
      isOpen={isOpen}
      position={position}
      onClose={() => setIsOpen(false)}
      selectedIndex={selectedIndex}
    >
      {menuItems.map((item, index) => {
        const tagColor = getTagColor(item.label);
        const accentColor = colors.accent[tagColor as keyof typeof colors.accent];
        const iconColor = accentColor && 'text' in accentColor 
          ? accentColor.text 
          : colors.text.secondary;

        return (
          <div
            key={item.label}
            ref={(el) => (itemRefs.current[index] = el)}
          >
            <DropdownItem
              icon={<HashStraight size={16} style={{ color: iconColor }} />}
              label={item.type === 'create' ? `Create "${item.label}"` : `#${item.label}`}
              isSelected={index === selectedIndex}
              onClick={() => handleSelectTag(item.label)}
            />
          </div>
        );
      })}
    </AutocompleteDropdown>
  );
}
