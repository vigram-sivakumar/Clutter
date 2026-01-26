/**
 * HashtagMenuUI - Presentational component for hashtag suggestions
 * 
 * Pure UI component - can be used in any context (editor, tag input, etc.)
 * For editor integration, use HashtagMenu instead.
 */

import { useMemo } from 'react';
import { useNotesStore, useAllTags } from '@clutter/state';
import {
  AutocompleteDropdown,
  DropdownItem,
  TagPill,
  useTheme,
} from '@clutter/ui';

interface HashtagMenuUIProps {
  isOpen: boolean;
  position: { top?: number; bottom?: number; left: number } | null;
  onClose: () => void;
  suggestions: string[];
  selectedIndex: number;
  onSelectTag: (_tag: string) => void;
  query: string;
  existingTags: string[];
}

export function HashtagMenuUI({
  isOpen,
  position,
  onClose,
  suggestions,
  selectedIndex,
  onSelectTag,
  query,
  existingTags,
}: HashtagMenuUIProps) {
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

  // Display tags with counts
  const displayTags = useMemo(() => {
    if (!query.trim()) {
      return [...tagsWithCounts]
        .filter(({ tag }) => !existingTagsLower.includes(tag.toLowerCase()))
        .sort((a, b) => a.tag.toLowerCase().localeCompare(b.tag.toLowerCase()));
    } else {
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

  // No matches but has query - show "Create" option
  if (displayTags.length === 0 && query.trim()) {
    const trimmedQuery = query.trim();

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
}
