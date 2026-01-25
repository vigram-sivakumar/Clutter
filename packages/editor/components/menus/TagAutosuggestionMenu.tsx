/**
 * TagAutosuggestionMenu - Dropdown menu for tag suggestions
 *
 * Shows tag suggestions as user types in TagInput
 */

import { useMemo } from 'react';
import { useNotesStore } from '@clutter/state';
import { useAllTags } from '@clutter/state';
import {
  AutocompleteDropdown,
  DropdownItem,
  TagPill,
  useTheme,
} from '@clutter/ui';

interface TagAutosuggestionMenuProps {
  isOpen: boolean;
  position: { top?: number; bottom?: number; left: number } | null;
  onClose: () => void;
  suggestions: string[]; // Filtered suggestions based on user input
  selectedIndex: number;
  onSelectTag: (_tag: string) => void;
  query: string; // Current input value
  existingTags: string[]; // Tags already added to the note
}

export const TagAutosuggestionMenu = ({
  isOpen,
  position,
  onClose,
  suggestions,
  selectedIndex,
  onSelectTag,
  query,
  existingTags,
}: TagAutosuggestionMenuProps) => {
  const notes = useNotesStore((state) => state.notes);
  const allTags = useAllTags();
  const { colors } = useTheme();

  // Filter to exclude already-added tags
  const existingTagsLower = useMemo(
    () => existingTags.map((t) => t.toLowerCase()),
    [existingTags]
  );

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

  // When no query, show all tags sorted alphabetically
  // When there's a query, show filtered suggestions (already sorted by parent)
  // Always exclude tags already added to the note
  const displayTags = useMemo(() => {
    if (!query.trim()) {
      // No input - show all tags sorted alphabetically, excluding existing ones
      return [...tagsWithCounts]
        .filter(({ tag }) => !existingTagsLower.includes(tag.toLowerCase()))
        .sort((a, b) => a.tag.toLowerCase().localeCompare(b.tag.toLowerCase()));
    } else {
      // Has input - show filtered suggestions with their counts, excluding existing ones
      return suggestions
        .filter((tag) => !existingTagsLower.includes(tag.toLowerCase()))
        .map((tag) => {
          const tagData = tagsWithCounts.find(
            (t) => t.tag.toLowerCase() === tag.toLowerCase()
          );
          return { tag, count: tagData?.count || 0 };
        });
    }
  }, [query, tagsWithCounts, suggestions, existingTagsLower]);

  // No matches but has query - show "Create" option (unless tag already exists on note)
  if (displayTags.length === 0 && query.trim()) {
    const trimmedQuery = query.trim();

    // Don't show "Create" if tag already exists on the note
    if (existingTagsLower.includes(trimmedQuery.toLowerCase())) {
      return null;
    }

    return (
      <AutocompleteDropdown
        isOpen={isOpen}
        position={position}
        onClose={onClose}
        selectedIndex={0}
      >
        <DropdownItem
          isSelected={selectedIndex === 0}
          onClick={() => onSelectTag(trimmedQuery)}
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
      onClose={onClose}
      selectedIndex={selectedIndex}
    >
      {displayTags.map(({ tag, count }, index) => (
        <DropdownItem
          key={tag}
          isSelected={index === selectedIndex}
          onClick={() => onSelectTag(tag)}
          compact={true}
          count={count}
        >
          <TagPill label={tag} />
        </DropdownItem>
      ))}
    </AutocompleteDropdown>
  );
};
