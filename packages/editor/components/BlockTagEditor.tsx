/**
 * BlockTagEditor - Manages tag display for block-level tags
 *
 * Handles:
 * - Rendering tag pills with hover effects
 * - Tag removal
 * - Tag click navigation
 *
 * Simplified version - tag editing/renaming is done in the sidebar tag view.
 */

import React, { useCallback } from 'react';
import { Tag } from '@clutter/ui';
import { spacing } from '../tokens';

interface BlockTagEditorProps {
  tags: string[];
  onUpdate: (tags: string[]) => void;
  onTagClick?: (tag: string) => void;
}

export function BlockTagEditor({
  tags,
  onUpdate,
  onTagClick,
}: BlockTagEditorProps) {
  const handleRemoveTag = useCallback(
    (tagToRemove: string) => {
      const newTags = tags.filter((tag: string) => tag !== tagToRemove);
      onUpdate(newTags);
    },
    [tags, onUpdate]
  );

  if (tags.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        gap: spacing['4'],
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      {tags.map((tag: string) => (
        <Tag
          key={tag}
          label={tag}
          onRemove={() => handleRemoveTag(tag)}
          onClick={onTagClick}
        />
      ))}
    </div>
  );
}
