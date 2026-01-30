/**
 * ListBlock - React node view for list items with block primitives
 *
 * Refactored to use block primitives for consistency.
 * Notion-style structure with 4 list types: bullet, numbered, task, toggle.
 *
 * Domain logic preserved:
 * - L-shaped connectors for nested items
 * - Collapse toggle with completion count
 * - Task checkbox sync
 * - Numbering calculation
 */

import React, { useMemo, useCallback } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { spacing, sizing, typography } from '../../tokens';
import type { ListBlockAttrs } from '../types';
import { useEditorTheme } from '../../theme/EditorThemeContext';
import { Checkbox } from '@clutter/ui';
import {
  useBlock,
  BlockHoverZones,
  MarkerContainer,
  BlockSelectionHalo,
} from './primitives';

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

  // FLAT MODEL: Count contiguous following TASK blocks with indent > current
  let total = 0;
  let completed = 0;

  for (let i = currentIndex + 1; i < blocks.length; i++) {
    const block = blocks[i];
    const blockIndent = block.attrs.indent ?? 0;

    // Stop if we've exited the visual subtree
    if (blockIndent <= currentIndent) break;

    // Only count task blocks
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

  // Collect all blocks in order
  const blocks: any[] = [];
  doc.descendants((node) => {
    if (node.attrs?.blockId) {
      blocks.push(node);
    }
    return true;
  });

  const currentIndex = blocks.findIndex(
    (n) => n.attrs.blockId === currentNode.attrs.blockId
  );
  if (currentIndex === -1 || currentIndex === blocks.length - 1) {
    return false;
  }

  const nextNode = blocks[currentIndex + 1];
  const nextIndent = nextNode.attrs.indent ?? 0;

  return nextIndent > currentIndent;
}

/**
 * Count hidden children (FLAT MODEL)
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

  const currentIndex = blocks.findIndex(
    (n) => n.attrs.blockId === currentNode.attrs.blockId
  );
  if (currentIndex === -1) return 0;

  // Count contiguous following blocks with indent > current
  let count = 0;
  for (let i = currentIndex + 1; i < blocks.length; i++) {
    const blockIndent = blocks[i].attrs.indent ?? 0;
    if (blockIndent > currentIndent) {
      count++;
    } else {
      break;
    }
  }

  return count;
}

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

  // Calculate list number for numbered lists
  const listNumber = useMemo(() => {
    if (listType !== 'numbered') return 0;
    const blockIndent = indent ?? 0;
    return calculateListNumber(editor, getPos, blockIndent);
  }, [editor, getPos, listType, indent, editor.state.doc]);

  // Get children info for tasks
  const childrenInfo = useMemo(() => {
    if (listType !== 'task')
      return { total: 0, completed: 0, hasChildren: false };
    return getChildrenInfo(editor, getPos);
  }, [editor, getPos, listType, editor.state.doc]);

  // Check if this block has children
  const hasChildrenFlag = useMemo(() => {
    return blockHasChildren(editor, getPos);
  }, [editor, getPos, editor.state.doc]);

  // Get priority level from attribute
  const committedPriority = priority || 0;

  // Detect uncommitted priority from text content (preview as user types)
  const textContent = node.textContent || '';
  const exclamationMatches = textContent.match(/!+/g);
  const previewPriority = exclamationMatches
    ? Math.min(Math.max(...exclamationMatches.map((m) => m.length)), 3)
    : 0;

  // Check if this task is a child of the previous task (for showing connectors)
  const showConnector = false; // Temporarily disabled

  // Handle checkbox toggle
  const handleCheckboxChange = useCallback(() => {
    const newChecked = !checked;
    updateAttributes({ checked: newChecked });
  }, [checked, updateAttributes]);

  // Handle collapse toggle
  const handleToggleCollapse = useCallback(() => {
    updateAttributes({ collapsed: !collapsed });
  }, [collapsed, updateAttributes]);

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

  // Calculate display level for marker styling (cycles based on indent)
  const blockIndent = indent ?? 0;
  const displayLevel = blockIndent;

  // Use block primitives for all common functionality
  const {
    wrapperProps,
    isSelected,
    indent: totalIndent,
  } = useBlock({
    node,
    editor,
    getPos,
    styleOverrides: {
      display: 'flex', // ListBlock-specific: flex layout
      flexDirection: 'column',
    },
  });

  // Render the marker content (bullet, number, or checkbox)
  const renderMarkerContent = () => {
    switch (listType) {
      case 'bullet': {
        const bulletStyle = displayLevel % 3;

        if (bulletStyle === 0) {
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
        const numberStyle = displayLevel % 3;
        let displayNumber: string;

        if (numberStyle === 0) {
          displayNumber = `${listNumber}.`;
        } else if (numberStyle === 1) {
          const letterIndex = ((listNumber - 1) % 26) + 1;
          displayNumber = `${String.fromCharCode(96 + letterIndex)}.`;
        } else {
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
            priority={Math.max(committedPriority, previewPriority)}
          />
        );
      }

      case 'toggle': {
        return (
          <svg
            width={sizing.marker}
            height={sizing.marker}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            onClick={handleToggleCollapse}
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
    const shouldShow =
      (listType === 'task' && childrenInfo.hasChildren) ||
      listType === 'toggle';

    if (!shouldShow) return null;

    const toggleMarginLeft = sizing.markerContainer + spacing.inline;
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
        {/* Chevron icon (tasks only) */}
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
        {/* Completion count (tasks only) */}
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
        {/* Hidden children counter (toggles only, when collapsed) */}
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
        {/* Empty toggle message */}
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
      {...wrapperProps}
      data-list-type={listType}
      data-checked={checked}
      data-collapsed={collapsed}
      className="block-handle-wrapper"
    >
      {/* Hover detection zones */}
      <BlockHoverZones />

      {/* Main row: marker + content */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: spacing.inline,
        }}
      >
        <div style={{ color: colors.text.tertiary, position: 'relative' }}>
          {/* L-shaped connector for nested task items */}
          {showConnector && (
            <div
              style={{
                position: 'absolute',
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

      {/* Toggle row for tasks with children */}
      {renderToggleRow()}

      {/* Block selection visual */}
      <BlockSelectionHalo isSelected={isSelected} indent={totalIndent} />
    </NodeViewWrapper>
  );
}
