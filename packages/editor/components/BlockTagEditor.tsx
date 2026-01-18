/**
 * BlockTagEditor - Manages tag editing for block-level tags
 * 
 * Handles:
 * - Rendering tag pills with hover effects
 * - Floating context menu for tag editing
 * - Color picker integration
 * - Tag removal
 * - Tag renaming
 * 
 * This component encapsulates all the complex hover, floating menu,
 * and editing logic for block-level tags.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useFloating, autoUpdate, offset, flip, shift } from '@floating-ui/react';
import { createPortal } from 'react-dom';
import { Tag, TagContextContent, getTagColor, Trash2 } from '@clutter/ui';
import { useEditorContext } from '../context/EditorContext';
import { useEditorTheme } from '../theme/EditorThemeContext';
import { sizing, spacing } from '../tokens';

interface BlockTagEditorProps {
  tags: string[];
  onUpdate: (tags: string[]) => void;
  onTagClick?: (tag: string) => void; // For navigation - if provided, uses direct click instead of hover
}

export function BlockTagEditor({ tags, onUpdate, onTagClick }: BlockTagEditorProps) {
  const { getTagMetadata, onUpdateTagMetadata, onUpsertTagMetadata, onRenameTag } = useEditorContext();
  const { colors } = useEditorTheme();

  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const scheduleCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Floating UI positioning
  const { x, y, strategy, refs } = useFloating({
    placement: 'top',
    middleware: [
      offset(2),
      flip(),
      shift({ padding: 20 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    const newTags = tags.filter((tag: string) => tag !== tagToRemove);
    onUpdate(newTags);
  }, [tags, onUpdate]);

  const handleCloseEditor = useCallback(() => {
    setEditingTag(null);
    if (scheduleCloseTimeoutRef.current) {
      clearTimeout(scheduleCloseTimeoutRef.current);
      scheduleCloseTimeoutRef.current = null;
    }
  }, []);

  const handleOpenEditor = useCallback((tag: string, event: { clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    refs.setReference(event.currentTarget);
    setAnchorEl(event.currentTarget);
    setEditingTag(tag);

    if (scheduleCloseTimeoutRef.current) {
      clearTimeout(scheduleCloseTimeoutRef.current);
      scheduleCloseTimeoutRef.current = null;
    }
  }, [refs]);

  const handleRenameTag = useCallback((oldTag: string, newTag: string) => {
    // Before renaming, ensure the tag has a color saved to metadata
    // This preserves the visual appearance through the rename
    const metadata = getTagMetadata(oldTag);
    if (!metadata?.color) {
      // Save the current hash-based color so it's preserved after rename
      const currentVisualColor = getTagColor(oldTag);
      if (metadata) {
        onUpdateTagMetadata(oldTag, { color: currentVisualColor });
      } else {
        onUpsertTagMetadata(oldTag, '', true, false, currentVisualColor);
      }
    }
    
    // IMPORTANT: Call renameTag to update metadata globally
    // This removes the old tag from all notes' metadata before the sync happens
    onRenameTag(oldTag, newTag);
    
    // Then update the local block tags
    // Use requestAnimationFrame to ensure renameTag completes first
    requestAnimationFrame(() => {
      const newTags = tags.map((t: string) => t.toLowerCase() === oldTag.toLowerCase() ? newTag : t);
      onUpdate(newTags);
    });
    
    handleCloseEditor();
  }, [tags, onRenameTag, onUpdate, handleCloseEditor, getTagMetadata, onUpdateTagMetadata, onUpsertTagMetadata]);

  const handleColorChange = useCallback((tag: string, color: string) => {
    const existing = getTagMetadata(tag);
    if (existing) {
      onUpdateTagMetadata(tag, { color });
    } else {
      onUpsertTagMetadata(tag, '', true, false, color);
    }
  }, [getTagMetadata, onUpdateTagMetadata, onUpsertTagMetadata]);

  const handleScheduleClose = useCallback(() => {
    if (isEditingName) return;
    
    scheduleCloseTimeoutRef.current = setTimeout(() => {
      handleCloseEditor();
    }, 300);
  }, [handleCloseEditor, isEditingName]);

  const handleCancelScheduledClose = useCallback(() => {
    if (scheduleCloseTimeoutRef.current) {
      clearTimeout(scheduleCloseTimeoutRef.current);
      scheduleCloseTimeoutRef.current = null;
    }
  }, []);

  // Click outside to close
  useEffect(() => {
    if (!editingTag) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        refs.floating.current &&
        !refs.floating.current.contains(event.target as Node) &&
        anchorEl &&
        !anchorEl.contains(event.target as Node)
      ) {
        handleCloseEditor();
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editingTag, refs.floating, anchorEl, handleCloseEditor]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (scheduleCloseTimeoutRef.current) {
        clearTimeout(scheduleCloseTimeoutRef.current);
      }
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  if (tags.length === 0) {
    return null;
  }

  return (
    <>
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
            onClick={onTagClick ? (label) => onTagClick(label) : () => {}}
          />
        ))}
      </div>

      {/* Floating context menu for tag editing */}
      {editingTag && anchorEl && createPortal(
        <div
          ref={refs.setFloating}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={() => {
            if (closeTimeoutRef.current) {
              clearTimeout(closeTimeoutRef.current);
              closeTimeoutRef.current = null;
            }
            handleCancelScheduledClose();
          }}
          onMouseLeave={() => {
            if (isEditingName) return;
            
            closeTimeoutRef.current = setTimeout(() => {
              handleCloseEditor();
            }, 150);
          }}
          style={{
            position: strategy,
            top: y ?? 0,
            left: x ?? 0,
            zIndex: sizing.zIndex.dropdown,
            backgroundColor: colors.background.default,
            border: `1px solid ${colors.border.default}`,
            borderRadius: sizing.radius.md,
            padding: spacing.xs,
            boxShadow: `0 4px 12px ${colors.shadow.md}`,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            width: 'fit-content',
            height: 'fit-content',
          }}
        >
          <TagContextContent
            tag={editingTag}
            currentColor={getTagMetadata(editingTag)?.color || getTagColor(editingTag)}
            onFilter={(tag) => {
              const event = new CustomEvent('tag-filter-requested', {
                detail: { tag },
              });
              window.dispatchEvent(event);
              handleCloseEditor();
            }}
            onRename={handleRenameTag}
            onColorChange={handleColorChange}
            onEditingStateChange={setIsEditingName}
          />
          
          {/* Delete button */}
          <button
            onClick={() => {
              handleRemoveTag(editingTag);
              handleCloseEditor();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: sizing.button.small,
              height: sizing.button.small,
              padding: 0,
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: sizing.radius.sm,
              cursor: 'pointer',
              color: colors.text.tertiary,
              transition: 'background-color 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.background.hover}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Trash2 size={14} />
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

