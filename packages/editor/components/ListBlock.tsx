/**
 * ListBlock - React node view for list items
 *
 * Notion-style structure:
 * - [Marker 24px] [Content flex:1]
 * - Connector via CSS pseudo-element (in padding area)
 * - No ul/ol/li - all divs
 *
 * Features:
 * - L-shaped connectors for nested items (CSS)
 * - Collapse toggle with completion count for tasks with children
 * - Checkbox sync (parent -> children)
 */

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { spacing, sizing, typography } from '../tokens';
import type { ListBlockAttrs } from '../types';
import { useEditorTheme } from '../theme/EditorThemeContext';
import { usePlaceholder } from '../hooks/usePlaceholder';
import { useBlockSelection } from '../hooks/useBlockSelection';
import { MarkerContainer } from './BlockWrapper';
import { BlockHandle } from './BlockHandle';
import { BlockSelectionHalo } from './BlockSelectionHalo';
import { TaskPriorityIndicator } from './TaskPriorityIndicator';
import { Checkbox } from '@clutter/ui';

// Props are provided by TipTap's ReactNodeViewRenderer
type ListBlockProps = NodeViewProps;

/**
 * Calculate the list number for a numbered list item
 */
function calculateListNumber(
  editor: NodeViewProps['editor'],
  getPos: () => number | undefined,
  indent: number
): number {
  const pos = getPos();
  if (pos === undefined) return 1;

  let count = 1;
  const doc = editor.state.doc;

  doc.nodesBetween(0, pos, (node, nodePos) => {
    if (nodePos >= pos) return false;

    if (node.type.name === 'listBlock') {
      const attrs = node.attrs as ListBlockAttrs;
      if (attrs.listType === 'numbered' && attrs.indent === indent) {
        count++;
      }
      // Reset on non-numbered lists or lower indent
      if (attrs.listType !== 'numbered' || attrs.indent < indent) {
        count = 1;
      }
    } else if (
      node.type.name === 'paragraph' ||
      node.type.name === 'heading' ||
      node.type.name === 'blockquote' ||
      node.type.name === 'callout' ||
      node.type.name === 'codeBlock' ||
      node.type.name === 'toggleHeader' ||
      node.type.name === 'horizontalRule'
    ) {
      // Reset count when any other block type interrupts the numbered list
      count = 1;
    }

    return true;
  });

  return count;
}

/**
 * Get children info for a task (FLAT MODEL)
 *
 * RULE: Count contiguous following task blocks with indent > current indent
 * This gives us the visual subtree of tasks under this task
 */
function getChildrenInfo(
  editor: NodeViewProps['editor'],
  getPos: () => number | undefined
): { total: number; completed: number; hasChildren: boolean } {
  const pos = getPos();
  if (pos === undefined) return { total: 0, completed: 0, hasChildren: false };

  const doc = editor.state.doc;
  const currentNode = doc.nodeAt(pos);
  if (!currentNode) return { total: 0, completed: 0, hasChildren: false };

  const currentIndent = currentNode.attrs.indent ?? 0;

  // Collect all blocks in order
  const blocks: any[] = [];
  doc.descendants((node) => {
    if (node.attrs?.blockId) {
      blocks.push(node);
    }
    return true;
  });

  // Find current block index
  const currentIndex = blocks.findIndex(
    (n) => n.attrs.blockId === currentNode.attrs.blockId
  );
  if (currentIndex === -1)
    return { total: 0, completed: 0, hasChildren: false };

  // 🔥 FLAT MODEL: Count contiguous following TASK blocks with indent > current
  let total = 0;
  let completed = 0;

  for (let i = currentIndex + 1; i < blocks.length; i++) {
    const block = blocks[i];
    const blockIndent = block.attrs.indent ?? 0;

    // Stop if we've exited the visual subtree
    if (blockIndent <= currentIndent) break;

    // Only count task blocks (not bullets, numbered, toggles)
    if (block.type.name === 'listBlock' && block.attrs.listType === 'task') {
      total++;
      if (block.attrs.checked) {
        completed++;
      }
    }
  }

  return { total, completed, hasChildren: total > 0 };
}

/**
 * Check if a block has children (FLAT MODEL)
 *
 * RULE: A block has children if the next block has greater indent
 * NO parent pointers. Pure array logic.
 */
function blockHasChildren(
  editor: NodeViewProps['editor'],
  getPos: () => number | undefined
): boolean {
  const pos = getPos();
  if (pos === undefined) return false;

  const doc = editor.state.doc;
  const currentNode = doc.nodeAt(pos);
  if (!currentNode) return false;

  const currentIndent = currentNode.attrs.indent ?? 0;

  // Find current block index and next block
  let currentIndex = -1;
  let nextNode: any = null;

  const blocks: any[] = [];
  doc.descendants((node) => {
    if (node.attrs?.blockId) {
      blocks.push(node);
    }
    return true;
  });

  currentIndex = blocks.findIndex(
    (n) => n.attrs.blockId === currentNode.attrs.blockId
  );
  if (currentIndex === -1 || currentIndex === blocks.length - 1) {
    return false; // No next block
  }

  nextNode = blocks[currentIndex + 1];
  const nextIndent = nextNode.attrs.indent ?? 0;

  // Has children if next block is more indented
  return nextIndent > currentIndent;
}

/**
 * Count hidden children (FLAT MODEL)
 *
 * RULE: Count all contiguous following blocks with indent > current indent
 * This is the "visual subtree" - same logic as range-based outdent
 */
function countHiddenChildren(
  editor: NodeViewProps['editor'],
  getPos: () => number | undefined
): number {
  const pos = getPos();
  if (pos === undefined) return 0;

  const doc = editor.state.doc;
  const currentNode = doc.nodeAt(pos);
  if (!currentNode) return 0;

  const currentIndent = currentNode.attrs.indent ?? 0;

  // Collect all blocks in order
  const blocks: any[] = [];
  doc.descendants((node) => {
    if (node.attrs?.blockId) {
      blocks.push(node);
    }
    return true;
  });

  // Find current block index
  const currentIndex = blocks.findIndex(
    (n) => n.attrs.blockId === currentNode.attrs.blockId
  );
  if (currentIndex === -1) return 0;

  // 🔥 FLAT MODEL: Count contiguous following blocks with indent > current
  let count = 0;
  for (let i = currentIndex + 1; i < blocks.length; i++) {
    const blockIndent = blocks[i].attrs.indent ?? 0;
    if (blockIndent > currentIndent) {
      count++;
    } else {
      break; // Stop at first block not deeper than current
    }
  }

  return count;
}

// TODO: Task cascading (parent → child checked state)
// This feature was removed during flat model migration.
// The old implementation relied on parentBlockId (tree model).
//
// To reimplement:
// - Use indent-based hierarchy (find children by indent > parent.indent)
// - Walk forward from current task until indent returns to same/less
// - Update all tasks in that range
//
// Defer until indent/outdent is fully battle-tested.

export function ListBlock({
  node,
  editor,
  getPos,
  updateAttributes,
}: ListBlockProps) {
  if (!node.attrs.blockId) {
    throw new Error('Invariant violation: ListBlock rendered without blockId');
  }

  const { colors } = useEditorTheme();
  const attrs = node.attrs as ListBlockAttrs;
  const { listType, checked, collapsed, priority, indent } = attrs;

  // Check if this block is selected
  const isSelected = useBlockSelection({
    editor,
    getPos,
    nodeSize: node.nodeSize,
  });

  // Force re-render when document updates (for reactive children info)
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const handleFocusChange = () => {
      forceUpdate((prev) => prev + 1);
    };

    // 🔒 CRITICAL FIX: Do NOT listen to selectionUpdate
    // React re-renders on selection change interfere with ProseMirror's cursor placement
    // Only re-render on focus/blur - selection handled by useMemo in usePlaceholder
    editor.on('focus', handleFocusChange);
    editor.on('blur', handleFocusChange);
    return () => {
      editor.off('focus', handleFocusChange);
      editor.off('blur', handleFocusChange);
    };
  }, [editor]);

  // 🔥 FLAT MODEL: Calculate indent FIRST (used by other calculations)
  const blockIndent = indent ?? 0;

  // Calculate list number for numbered lists
  const listNumber = useMemo(() => {
    if (listType !== 'numbered') return 0;
    return calculateListNumber(editor, getPos, blockIndent);
  }, [editor, getPos, listType, blockIndent, editor.state.doc]);

  // Get children info for tasks
  const childrenInfo = useMemo(() => {
    if (listType !== 'task')
      return { total: 0, completed: 0, hasChildren: false };
    return getChildrenInfo(editor, getPos);
  }, [editor, getPos, listType, editor.state.doc]);

  // 🔥 FLAT MODEL: Check if this block has children (works for all types)
  const hasChildrenFlag = useMemo(() => {
    return blockHasChildren(editor, getPos);
  }, [editor, getPos, editor.state.doc]);

  // Canonical emptiness check (ProseMirror source of truth)
  const isEmpty = node.content.size === 0;

  // Placeholder text (includes focus detection via usePlaceholder)
  const placeholderText = usePlaceholder({ node, editor, getPos });

  // Get priority level from attribute (set when user types ! and presses space)
  const committedPriority = priority || 0;

  // Detect uncommitted priority from text content (preview as user types)
  const textContent = node.textContent || '';
  const exclamationMatches = textContent.match(/!+/g);
  const previewPriority = exclamationMatches
    ? Math.min(Math.max(...exclamationMatches.map((m) => m.length)), 3)
    : 0;

  // Check if this task is a child of the previous task (for showing connectors)
  // TODO: Implement isChildOfPreviousTask() function for visual task connectors
  // Temporarily disabled to avoid runtime error. See ARCHITECTURE.md for implementation plan.
  const showConnector = false;

  // Handle checkbox toggle
  const handleCheckboxChange = useCallback(() => {
    const newChecked = !checked;
    updateAttributes({ checked: newChecked });

    // NOTE: Task cascading temporarily disabled (see TODO comment above)
    // Was: if (childrenInfo.hasChildren) updateChildrenChecked(editor, getPos, newChecked);
  }, [checked, updateAttributes, editor, getPos, childrenInfo.hasChildren]);

  // Handle collapse toggle
  const handleToggleCollapse = useCallback(() => {
    updateAttributes({ collapsed: !collapsed });
  }, [
    collapsed,
    updateAttributes,
    node.attrs.blockId,
    node.attrs.indent,
    hasChildrenFlag,
  ]);

  // Keyboard handler for checkbox (Space/Enter)
  const handleCheckboxKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleCheckboxChange();
      }
    },
    [handleCheckboxChange]
  );

  // Helper: Convert number to lowercase roman numeral
  const toRomanNumeral = (num: number): string => {
    const romanMap: [number, string][] = [
      [1000, 'm'],
      [900, 'cm'],
      [500, 'd'],
      [400, 'cd'],
      [100, 'c'],
      [90, 'xc'],
      [50, 'l'],
      [40, 'xl'],
      [10, 'x'],
      [9, 'ix'],
      [5, 'v'],
      [4, 'iv'],
      [1, 'i'],
    ];
    let result = '';
    for (const [value, numeral] of romanMap) {
      while (num >= value) {
        result += numeral;
        num -= value;
      }
    }
    return result;
  };

  // 🔥 FLAT MODEL: Calculate total padding for rendering
  const totalIndent = blockIndent * spacing.indent;

  // Calculate display level for marker styling (cycles based on indent)
  const displayLevel = blockIndent;

  // Render the marker content (bullet, number, or checkbox)
  const renderMarkerContent = () => {
    switch (listType) {
      case 'bullet': {
        // Cycle through 3 bullet styles based on display level
        const bulletStyle = displayLevel % 3;

        if (bulletStyle === 0) {
          // Level 0, 3, 6... → • filled circle
          return (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: 'currentColor',
              }}
            />
          );
        } else if (bulletStyle === 1) {
          // Level 1, 4, 7... → ○ hollow circle
          return (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                border: '1.5px solid currentColor',
                backgroundColor: 'transparent',
              }}
            />
          );
        } else {
          // Level 2, 5, 8... → ■ filled square
          return (
            <span
              style={{
                width: 6,
                height: 6,
                backgroundColor: 'currentColor',
              }}
            />
          );
        }
      }

      case 'numbered': {
        // Cycle through 3 numbering styles based on display level
        const numberStyle = displayLevel % 3;
        let displayNumber: string;

        if (numberStyle === 0) {
          // Level 0, 3, 6... → 1. decimal
          displayNumber = `${listNumber}.`;
        } else if (numberStyle === 1) {
          // Level 1, 4, 7... → a. lowercase letter
          const letterIndex = ((listNumber - 1) % 26) + 1; // Wrap after 'z'
          displayNumber = `${String.fromCharCode(96 + letterIndex)}.`;
        } else {
          // Level 2, 5, 8... → i. lowercase roman
          displayNumber = `${toRomanNumeral(listNumber)}.`;
        }

        return (
          <span
            style={{
              fontFamily: typography.fontFamily,
              fontSize: typography.body,
              fontWeight: typography.weight.normal,
              color: 'currentColor',
            }}
          >
            {displayNumber}
          </span>
        );
      }

      case 'task': {
        return (
          <Checkbox
            checked={checked || false}
            onChange={handleCheckboxChange}
            onKeyDown={handleCheckboxKeyDown}
            onClick={(e) => {
              // Only remove focus ring on mouse click, not keyboard activation
              if (e.detail !== 0) {
                e.currentTarget.blur();
              }
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = `2px solid ${colors.border.focus}`;
              e.currentTarget.style.outlineOffset = '1px';
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = 'none';
            }}
            size={sizing.marker}
          />
        );
      }

      case 'toggle': {
        // Toggle marker: chevron that rotates based on collapsed state
        return (
          <svg
            onClick={handleToggleCollapse}
            width={sizing.marker}
            height={sizing.marker}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              cursor: 'pointer',
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        );
      }

      default:
        return null;
    }
  };

  // Render toggle row (below text, for tasks/toggles with children)
  const renderToggleRow = () => {
    // 🔥 FLAT MODEL: Show caret for ANY block with children (task or toggle)
    // In flat model, collapse is universal - any block can collapse its visual children
    // ALSO show message for empty toggles
    const shouldShow =
      (listType === 'task' && childrenInfo.hasChildren) ||
      listType === 'toggle'; // Show for all toggles (with or without children)

    if (!shouldShow) return null;

    // Align with text: marker container (24px) + gap (4px) = 28px
    const toggleMarginLeft = sizing.markerContainer + spacing.inline;

    // STEP 4: Count hidden children for collapsed blocks
    const hiddenCount = collapsed ? countHiddenChildren(editor, getPos) : 0;

    return (
      <div
        onClick={handleToggleCollapse}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginLeft: toggleMarginLeft,
          cursor: 'pointer',
          fontSize: 12,
          color: colors.text.tertiary,
          userSelect: 'none',
        }}
      >
        {/* Chevron icon (tasks only - toggles use caret in marker) */}
        {listType === 'task' && (
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
        {/* Completion count (tasks only, shown ALWAYS - expanded or collapsed) */}
        {listType === 'task' && childrenInfo.hasChildren && (
          <span
            style={{
              fontSize: 11,
              color: colors.text.tertiary,
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            {childrenInfo.completed}/{childrenInfo.total} subtasks
          </span>
        )}
        {/* Hidden children counter (toggles only, shown when collapsed) */}
        {listType === 'toggle' && collapsed && hiddenCount > 0 && (
          <span
            style={{
              fontSize: 11,
              color: colors.text.tertiary,
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            {hiddenCount} hidden {hiddenCount === 1 ? 'item' : 'items'}
          </span>
        )}
        {/* Empty toggle message (toggles only, shown when no children) */}
        {listType === 'toggle' && !hasChildrenFlag && (
          <span
            style={{
              fontSize: 11,
              color: colors.text.tertiary,
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            Empty toggle
          </span>
        )}
      </div>
    );
  };

  // Content wrapper styles
  const contentStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    ...(listType === 'task' && checked
      ? {
          textDecoration: 'line-through',
          color: colors.text.tertiary,
        }
      : {}),
  };

  return (
    <NodeViewWrapper
      data-block-id={node.attrs.blockId}
      data-type="listBlock"
      data-list-type={listType}
      data-indent={blockIndent}
      data-checked={checked}
      data-collapsed={collapsed}
      data-empty={isEmpty ? 'true' : undefined}
      data-placeholder={placeholderText || undefined}
      className="block-handle-wrapper"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        paddingLeft: totalIndent,
        fontFamily: typography.fontFamily,
        fontSize: typography.body,
        lineHeight: typography.lineHeightRatio,
      }}
    >
      {/* Invisible hover bridge - covers gap between handle and content */}
      {/* Applied to ALL blocks (bullet, numbered, task) to keep handle visible when hovering */}
      <div
        contentEditable={false}
        style={{
          position: 'absolute',
          left: indent - 32, // Adjust with indentation: cover handle (24px) + gap (8px)
          top: 0,
          width: 32,
          height: '100%',
          pointerEvents: 'auto',
          userSelect: 'none',
          // Uncomment to visualize: backgroundColor: 'rgba(255,0,0,0.1)',
        }}
      />
      {/* Block handle (⋮⋮) - shows on hover */}
      <BlockHandle editor={editor} getPos={getPos} indent={indent} />

      {/* Main row: marker (24px) + gap (4px) + content */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: spacing.inline,
        }}
      >
        {/* PHASE 3 REFACTOR: Use shared MarkerContainer component */}
        <div style={{ color: colors.text.tertiary, position: 'relative' }}>
          {/* L-shaped connector for nested task items */}
          {/* Only show when previous sibling is also a task */}
          {showConnector && (
            <div
              style={{
                position: 'absolute',
                // Start at parent's checkbox center: -spacing.indent + markerContainer/2
                left: -spacing.indent + sizing.markerContainer / 2,
                top: 0,
                width: 12,
                height: 16,
                borderLeft: `1px solid ${colors.border.subtle}`,
                borderBottom: `1px solid ${colors.border.subtle}`,
                borderBottomLeftRadius: 4,
                pointerEvents: 'none',
              }}
            />
          )}
          <MarkerContainer>{renderMarkerContent()}</MarkerContainer>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          <NodeViewContent as="div" />
        </div>
      </div>

      {/* Priority indicators - outside the block (mirrors handle position) */}
      {listType === 'task' && (
        <TaskPriorityIndicator
          committedPriority={committedPriority}
          previewPriority={previewPriority}
          onDismiss={() => updateAttributes({ priority: 0 })}
        />
      )}

      {/* Toggle row for tasks with children */}
      {renderToggleRow()}

      {/* Block selection halo */}
      <BlockSelectionHalo isSelected={isSelected} indent={totalIndent} />

      {/* CSS to show handle on hover or when menu is open (but not while typing or in multi-selection) */}
      <style>{`
        .block-handle-wrapper:hover .block-handle:not([data-is-typing="true"]):not([data-in-multi-selection="true"]),
        .block-handle[data-menu-open="true"] {
          opacity: 1 !important;
        }
      `}</style>
    </NodeViewWrapper>
  );
}
